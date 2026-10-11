import { KioskService } from '../src/app/kioskService';
import {
  encodeSimTemplate,
  simController,
} from '../src/hardware/sim/simController';

type Handler = (
  url: string,
  init: RequestInit,
) => { status: number; body: unknown } | 'offline';

function installFetch(handler: Handler) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = jest.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init: init ?? {} });
      const result = handler(url, init ?? {});
      if (result === 'offline') throw new TypeError('Network request failed');
      return {
        ok: result.status < 300,
        status: result.status,
        json: async () => ({ success: result.status < 300, data: result.body }),
      } as Response;
    },
  ) as typeof fetch;
  return calls;
}

const session = {
  sessionToken: 'session-1',
  expiresAt: new Date(Date.now() + 12 * 3600_000).toISOString(),
  kiosk: {
    id: 'k1',
    deviceId: 'KSK-1',
    name: 'Front gate',
    verificationPolicy: 'FACE_OR_FINGER',
    hasAdminPin: false,
  },
  organization: { id: 'org1', name: 'Rona Foods', logoUrl: null },
};

const now = () => new Date().toISOString();

function fakeServer(state: { offline: boolean }): Handler {
  return (url, init) => {
    if (state.offline) return 'offline';
    const path = url.replace('https://api.test', '').split('?')[0];
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    switch (`${init.method} ${path}`) {
      case 'POST /api/kiosk/device/register':
        return { status: 201, body: session };
      case 'GET /api/kiosk/device/roster':
        return {
          status: 200,
          body: {
            serverTime: now(),
            employees: [
              {
                employeeId: 'e1',
                eid: 'EMP-1',
                fullName: 'Abebe Kebede',
                active: true,
                updatedAt: now(),
              },
            ],
          },
        };
      case 'GET /api/kiosk/device/templates':
        return {
          status: 200,
          body: {
            serverTime: now(),
            templates: [
              {
                id: 't1',
                employeeId: 'e1',
                kind: 'FACE',
                fingerIndex: null,
                algorithmVersion: 'sim-1',
                template: encodeSimTemplate({
                  employeeId: 'e1',
                  kind: 'FACE',
                  fingerIndex: null,
                }),
                createdAt: now(),
                revokedAt: null,
              },
            ],
          },
        };
      case 'GET /api/kiosk/device/cards':
        return { status: 200, body: { serverTime: now(), cards: [] } };
      case 'POST /api/kiosk/device/heartbeat':
        return {
          status: 200,
          body: {
            serverTime: now(),
            verificationPolicy: 'FACE_ONLY',
            hasAdminPin: true,
          },
        };
      case 'POST /api/kiosk/device/punch':
        return {
          status: 201,
          body: {
            eventId: 'ev1',
            clientEventId: body.clientEventId,
            employeeId: body.employeeId,
            employeeName: 'Abebe Kebede',
            eventType: body.eventType,
            eventAt: now(),
            duplicate: false,
          },
        };
      case 'POST /api/kiosk/device/punch/batch':
        return {
          status: 200,
          body: {
            results: body.events.map((event: { clientEventId: string }) => ({
              clientEventId: event.clientEventId,
              status: 'RECORDED',
              result: {
                ...event,
                eventId: 'ev2',
                employeeName: 'Abebe Kebede',
                eventAt: now(),
                duplicate: false,
              },
            })),
          },
        };
      default:
        return { status: 404, body: null };
    }
  };
}

describe('KioskService', () => {
  let service: KioskService;
  afterEach(() => service?.stop());

  it('pairs, syncs templates into the engine and records heartbeat policy', async () => {
    const state = { offline: false };
    const calls = installFetch(fakeServer(state));
    service = new KioskService();
    await service.init();
    await service.pair({
      apiUrl: 'https://api.test/api',
      token: 'device-token',
    });

    const data = service.store.getSnapshot();
    expect(data.pairing?.kioskName).toBe('Front gate');
    expect(Object.keys(data.roster)).toEqual(['e1']);
    expect(simController.isEnrolled('FACE', 'e1')).toBe(true);

    const register = calls.find(c => c.url.endsWith('/device/register'))!;
    expect(JSON.parse(String(register.init.body))).toMatchObject({
      deviceToken: 'device-token',
      device: { engine: 'SIM', capabilities: ['FACE', 'FINGER'] },
    });

    await service.heartbeat();
    expect(service.store.getSnapshot().pairing?.verificationPolicy).toBe(
      'FACE_ONLY',
    );
  });

  it('queues punches offline and drains them once back online', async () => {
    const state = { offline: false };
    const calls = installFetch(fakeServer(state));
    service = new KioskService();
    await service.init();
    await service.pair({ apiUrl: 'https://api.test', token: 'device-token' });

    state.offline = true;
    const outcome = await service.punch({
      employeeId: 'e1',
      eventType: 'CLOCK_IN',
      methods: ['FACE'],
    });
    expect(outcome.status).toBe('queued');
    expect(service.store.getSnapshot().queue).toHaveLength(1);
    expect(service.store.getSnapshot().online).toBe(false);

    // Offline status lookups fall back to the locally known state.
    const status = await service.employeeStatus('e1');
    expect(status.allowedNextEvents).toEqual(['BREAK_START', 'CLOCK_OUT']);

    state.offline = false;
    await service.drainQueue();
    expect(service.store.getSnapshot().queue).toHaveLength(0);
    const batch = calls.find(c => c.url.endsWith('/punch/batch'))!;
    expect(JSON.parse(String(batch.init.body)).events[0]).toMatchObject({
      employeeId: 'e1',
      eventType: 'CLOCK_IN',
      methods: ['FACE'],
    });
  });

  it('drops back to pairing when the server revokes the session', async () => {
    const state = { offline: false };
    const base = fakeServer(state);
    let revoked = false;
    installFetch((url, init) => {
      if (revoked && url.includes('/device/'))
        return { status: 401, body: null };
      return base(url, init);
    });
    service = new KioskService();
    await service.init();
    await service.pair({ apiUrl: 'https://api.test', token: 'device-token' });

    const onRevoked = jest.fn();
    service.onRevoked(onRevoked);
    revoked = true;
    await expect(service.sync()).rejects.toMatchObject({ statusCode: 401 });
    expect(onRevoked).toHaveBeenCalled();
    expect(service.store.getSnapshot().pairing).toBeNull();
  });
});
