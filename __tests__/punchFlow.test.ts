import { NetworkError } from '../src/api/client';
import type { RosterEntry } from '../src/api/contract';
import type { VerificationPolicy } from '../src/config';
import { PunchFlow, type PunchFlowDeps } from '../src/domain/punchFlow';
import type {
  BiometricEngine,
  FaceEngine,
  FingerprintEngine,
  IdentifyOptions,
  IdentifyOutcome,
} from '../src/hardware/types';
import { strings } from '../src/i18n/strings';

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

/** Engine whose identify() resolves when the test says so. */
function controllableEngine<K extends 'FACE' | 'FINGER'>(kind: K) {
  const calls: {
    options: IdentifyOptions;
    resolve: (o: IdentifyOutcome) => void;
  }[] = [];
  const engine: BiometricEngine & { kind: K } = {
    kind,
    algorithmVersion: 'test',
    status: async () => 'READY',
    loadTemplates: async () => undefined,
    identify: options =>
      new Promise(resolve => {
        calls.push({ options, resolve });
        options.signal.addEventListener('abort', () =>
          resolve({ type: 'cancelled' }),
        );
      }),
    enroll: async () => ({ type: 'cancelled' }),
  };
  return { engine, calls };
}

const roster: Record<string, RosterEntry> = {
  e1: {
    employeeId: 'e1',
    eid: 'EMP-1',
    fullName: 'Abebe Kebede',
    active: true,
    updatedAt: '',
  },
  e2: {
    employeeId: 'e2',
    eid: 'EMP-2',
    fullName: 'Sara Tesfaye',
    active: true,
    updatedAt: '',
  },
  e3: {
    employeeId: 'e3',
    eid: 'EMP-3',
    fullName: 'Old Staff',
    active: false,
    updatedAt: '',
  },
};

function setup(
  policy: VerificationPolicy,
  overrides: Partial<PunchFlowDeps> = {},
) {
  const face = controllableEngine('FACE');
  const finger = controllableEngine('FINGER');
  let onCard: ((uid: string) => void) | null = null;
  const io = { signal: jest.fn() };
  const punch = jest.fn<
    ReturnType<PunchFlowDeps['punch']>,
    Parameters<PunchFlowDeps['punch']>
  >(async request => ({
    status: 'recorded',
    result: {
      employeeName: roster[request.employeeId].fullName,
      eventType: request.eventType,
      eventAt: '2026-10-10T08:00:00.000Z',
    },
  }));
  const flow = new PunchFlow({
    hardware: {
      face: { ...face.engine, Preview: () => null } as FaceEngine,
      finger: finger.engine as FingerprintEngine,
      card: {
        status: () => 'READY',
        listen: cb => {
          onCard = cb;
          return () => {
            onCard = null;
          };
        },
      },
      io,
    },
    policy: () => policy,
    employee: id => roster[id],
    cardByUid: uid =>
      uid === 'CARD1'
        ? { id: 'c1', employeeId: 'e1', uidHash: 'h', revokedAt: null }
        : undefined,
    employeeStatus: async id => ({
      employeeId: id,
      employeeName: roster[id].fullName,
      currentState: 'none',
      allowedNextEvents: ['CLOCK_IN'],
      lastEventAt: null,
    }),
    isOnline: () => true,
    punch,
    ...overrides,
  });
  return {
    flow,
    face,
    finger,
    io,
    punch,
    tapCard: (uid: string) => onCard?.(uid),
  };
}

afterEach(() => jest.useRealTimers());

describe('PunchFlow', () => {
  it('face match → choose allowed action → recorded', async () => {
    const { flow, face, finger, punch } = setup('FACE_OR_FINGER');
    flow.start();
    expect(flow.getState()).toEqual({
      phase: 'idle',
      identify: ['FACE', 'FINGER'],
    });
    expect(face.calls).toHaveLength(1);
    expect(finger.calls).toHaveLength(1);

    face.calls[0].resolve({ type: 'match', employeeId: 'e1', score: 91 });
    await flush();
    // The other engine is stopped once someone is identified.
    expect(finger.calls[0].options.signal.aborted).toBe(true);
    expect(flow.getState()).toMatchObject({
      phase: 'choose',
      employeeName: 'Abebe Kebede',
      methods: ['FACE'],
      status: { allowedNextEvents: ['CLOCK_IN'] },
    });

    await flow.select('CLOCK_IN');
    expect(punch).toHaveBeenCalledWith({
      employeeId: 'e1',
      eventType: 'CLOCK_IN',
      methods: ['FACE'],
      matchScore: 91,
      cardId: undefined,
    });
    expect(flow.getState()).toMatchObject({ phase: 'success', queued: false });
    flow.dispose();
  });

  it('card then face must be the same person', async () => {
    const { flow, face, tapCard } = setup('CARD_AND_FACE');
    flow.start();
    expect(face.calls).toHaveLength(0);
    tapCard('CARD1');
    expect(flow.getState()).toMatchObject({
      phase: 'confirm',
      factor: 'FACE',
      employeeId: 'e1',
    });
    expect(face.calls[0].options.candidateEmployeeId).toBe('e1');

    face.calls[0].resolve({ type: 'match', employeeId: 'e2', score: 88 });
    await flush();
    expect(flow.getState()).toEqual({
      phase: 'error',
      message: strings.errors.differentPerson,
    });
    flow.dispose();
  });

  it('card then face → methods include both factors', async () => {
    const { flow, face, tapCard, punch } = setup('CARD_AND_FACE');
    flow.start();
    tapCard('CARD1');
    face.calls[0].resolve({ type: 'match', employeeId: 'e1', score: 88 });
    await flush();
    await flow.select('CLOCK_IN');
    expect(punch.mock.calls[0][0]).toMatchObject({
      methods: ['CARD', 'FACE'],
      cardId: 'c1',
    });
    flow.dispose();
  });

  it('rejects unknown cards and inactive employees', async () => {
    const { flow, face, tapCard } = setup('CARD_AND_FACE');
    flow.start();
    tapCard('NOPE');
    expect(flow.getState()).toEqual({
      phase: 'error',
      message: strings.errors.unknownCard,
    });
    flow.dispose();

    const second = setup('FACE_ONLY');
    second.flow.start();
    second.face.calls[0].resolve({
      type: 'match',
      employeeId: 'e3',
      score: 95,
    });
    await flush();
    expect(second.flow.getState()).toEqual({
      phase: 'error',
      message: strings.errors.inactiveEmployee,
    });
    second.flow.dispose();
    expect(face.calls).toHaveLength(0);
  });

  it('shows liveness failures and returns to idle', async () => {
    jest.useFakeTimers();
    const { flow, face, io } = setup('FACE_ONLY');
    flow.start();
    face.calls[0].resolve({ type: 'liveness_failed' });
    await Promise.resolve();
    await Promise.resolve();
    expect(flow.getState()).toEqual({
      phase: 'error',
      message: strings.errors.livenessFailed,
    });
    expect(io.signal).toHaveBeenCalledWith('failure');
    jest.advanceTimersByTime(10_000);
    expect(flow.getState()).toMatchObject({ phase: 'idle' });
    expect(face.calls).toHaveLength(2);
    flow.dispose();
  });

  it('reports a queued punch when offline', async () => {
    const { flow, face } = setup('FACE_ONLY', {
      punch: async request => ({
        status: 'queued',
        employeeName: 'Abebe Kebede',
        eventType: request.eventType,
        eventAt: '2026-10-10T08:00:00.000Z',
      }),
    });
    flow.start();
    face.calls[0].resolve({ type: 'match', employeeId: 'e1', score: 90 });
    await flush();
    await flow.select('CLOCK_IN');
    expect(flow.getState()).toMatchObject({ phase: 'success', queued: true });
    flow.dispose();
  });

  it('surfaces server errors from the punch', async () => {
    const { flow, face } = setup('FACE_ONLY', {
      punch: async () => {
        throw new NetworkError('boom');
      },
    });
    flow.start();
    face.calls[0].resolve({ type: 'match', employeeId: 'e1', score: 90 });
    await flush();
    await flow.select('CLOCK_IN');
    expect(flow.getState()).toEqual({ phase: 'error', message: 'boom' });
    flow.dispose();
  });

  it('pauses hardware while the staff menu is open', async () => {
    const { flow, face } = setup('FACE_ONLY');
    flow.start();
    flow.pause();
    expect(face.calls[0].options.signal.aborted).toBe(true);
    flow.resume();
    expect(face.calls).toHaveLength(2);
    flow.dispose();
  });
});
