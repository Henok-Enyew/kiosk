import { planFor, satisfiesPolicy } from '../src/domain/policy';
import { allowedNextEvents, suggestedEvent } from '../src/domain/attendance';
import {
  applyBatchResult,
  enqueue,
  isExpired,
  nextBatch,
  type QueuedPunch,
} from '../src/domain/queue';
import { decodeBase64, encodeBase64 } from '../src/util/base64';
import { parsePairingQr } from '../src/screens/PairingScreen';

const all = { FACE: true, FINGER: true, CARD: true };

describe('verification policy', () => {
  it('never accepts a card alone', () => {
    expect(satisfiesPolicy('CARD_AND_FACE', ['CARD'])).toBe(false);
    expect(satisfiesPolicy('CARD_AND_FINGER', ['CARD'])).toBe(false);
    expect(satisfiesPolicy('CARD_AND_FACE', ['CARD', 'FACE'])).toBe(true);
  });

  it('does not accept a passcode on native terminals', () => {
    expect(satisfiesPolicy('FACE_OR_FINGER', ['PASSCODE'])).toBe(false);
  });

  it('plans identify and confirm factors', () => {
    expect(planFor('FACE_OR_FINGER', all)).toEqual({
      identify: ['FACE', 'FINGER'],
      confirm: null,
      missing: [],
    });
    expect(planFor('CARD_AND_FINGER', all)).toMatchObject({
      identify: ['CARD'],
      confirm: 'FINGER',
    });
    expect(
      planFor('FACE_OR_FINGER', { FACE: false, FINGER: true, CARD: false })
        .identify,
    ).toEqual(['FINGER']);
  });

  it('reports missing hardware', () => {
    expect(
      planFor('CARD_AND_FACE', { FACE: true, FINGER: true, CARD: false })
        .missing,
    ).toEqual(['CARD']);
    expect(
      planFor('FACE_AND_FINGER', { FACE: true, FINGER: false, CARD: false })
        .missing,
    ).toEqual(['FINGER']);
  });
});

describe('attendance transitions', () => {
  it('mirrors the server sequence rules', () => {
    expect(allowedNextEvents('none')).toEqual(['CLOCK_IN']);
    expect(allowedNextEvents('CLOCK_IN')).toEqual(['BREAK_START', 'CLOCK_OUT']);
    expect(allowedNextEvents('BREAK_START')).toEqual(['BREAK_END']);
    expect(allowedNextEvents(undefined)).toHaveLength(4);
  });

  it('suggests the obvious action', () => {
    expect(suggestedEvent(['CLOCK_IN'])).toBe('CLOCK_IN');
    expect(suggestedEvent(['BREAK_START', 'CLOCK_OUT'])).toBeNull();
  });
});

describe('offline queue', () => {
  const item = (id: string, at: string): QueuedPunch => ({
    input: {
      clientEventId: id,
      employeeId: 'e1',
      eventType: 'CLOCK_IN',
      methods: ['FACE'],
      deviceEventAt: at,
    },
    employeeName: 'Abebe',
    attempts: 0,
  });

  it('dedupes by clientEventId and sends oldest first', () => {
    let queue = enqueue([], item('b', '2026-10-10T09:00:00Z'));
    queue = enqueue(queue, item('a', '2026-10-10T08:00:00Z'));
    queue = enqueue(queue, item('a', '2026-10-10T08:00:00Z'));
    expect(queue).toHaveLength(2);
    expect(nextBatch(queue).map(q => q.input.clientEventId)).toEqual([
      'a',
      'b',
    ]);
  });

  it('removes recorded and rejected, keeps the rest', () => {
    const a = item('a', '2026-10-10T08:00:00Z');
    const b = item('b', '2026-10-10T09:00:00Z');
    const c = item('c', '2026-10-10T10:00:00Z');
    const outcome = applyBatchResult(
      [a, b, c],
      [a, b],
      [
        {
          clientEventId: 'a',
          status: 'RECORDED',
          result: {
            eventId: '1',
            clientEventId: 'a',
            employeeId: 'e1',
            employeeName: 'Abebe',
            eventType: 'CLOCK_IN',
            eventAt: a.input.deviceEventAt,
            duplicate: false,
          },
        },
        {
          clientEventId: 'b',
          status: 'REJECTED',
          error: { statusCode: 409, message: 'sequence' },
        },
      ],
    );
    expect(outcome.recorded.map(q => q.input.clientEventId)).toEqual(['a']);
    expect(outcome.rejected[0].reason).toBe('sequence');
    expect(outcome.remaining.map(q => q.input.clientEventId)).toEqual(['c']);
  });

  it('expires punches older than the sync window', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    expect(isExpired(item('a', '2026-10-06T12:00:00Z'), now)).toBe(true);
    expect(isExpired(item('a', '2026-10-09T12:00:00Z'), now)).toBe(false);
  });
});

describe('utils', () => {
  it('round-trips base64 with UTF-8', () => {
    const text = '{"name":"አበበ ✓"}';
    expect(decodeBase64(encodeBase64(text))).toBe(text);
    expect(encodeBase64('hello')).toBe('aGVsbG8=');
  });

  it('parses the admin QR code', () => {
    expect(
      parsePairingQr('{"v":1,"api":"https://api.rona.pro.et","token":"abc"}'),
    ).toEqual({
      v: 1,
      api: 'https://api.rona.pro.et',
      token: 'abc',
    });
    expect(parsePairingQr('not json')).toBeNull();
    expect(parsePairingQr('{"v":2,"api":"https://x","token":"a"}')).toBeNull();
  });
});
