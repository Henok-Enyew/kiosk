import {
  ApiError,
  KioskHttpClient,
  NetworkError,
  normalizeBaseUrl,
} from '../src/api/client';

const signer = {
  sign: jest.fn(async (data: string) => `signed(${data})`),
  // Stand-in hash: the test checks the canonical string, not SHA-256 itself.
  sha256Hex: (data: string) => `hash(${data})`,
};

function response(status: number, body: unknown, date?: Date) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) =>
        name === 'date' && date ? date.toUTCString() : null,
    },
    json: async () => body,
  } as unknown as Response;
}

describe('KioskHttpClient', () => {
  beforeEach(() => signer.sign.mockClear());

  it('signs method, path+query, timestamp and body hash', async () => {
    const fetchImpl = jest.fn(async () =>
      response(200, { success: true, data: { ok: 1 } }),
    );
    const client = new KioskHttpClient(
      'https://api.example.com/api/',
      signer,
      fetchImpl,
    );
    client.attachSession({
      kioskId: () => 'k1',
      token: async () => 'tok',
      renew: jest.fn(),
    });

    const data = await client.request('POST', '/api/kiosk/device/punch', {
      body: { a: 1 },
      query: { since: '2026-10-10T00:00:00.000Z', skip: undefined },
    });

    expect(data).toEqual({ ok: 1 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://api.example.com/api/kiosk/device/punch?since=2026-10-10T00%3A00%3A00.000Z',
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok');
    const canonical = [
      'POST',
      '/api/kiosk/device/punch?since=2026-10-10T00%3A00%3A00.000Z',
      headers['x-kiosk-timestamp'],
      signer.sha256Hex('{"a":1}'),
    ].join('\n');
    expect(headers['x-kiosk-signature']).toBe(`signed(${canonical})`);
  });

  it('hashes an empty body for GET', async () => {
    const fetchImpl = jest.fn(async () =>
      response(200, { success: true, data: [] }),
    );
    const client = new KioskHttpClient('https://x', signer, fetchImpl);
    client.attachSession({
      kioskId: () => 'k1',
      token: async () => 'tok',
      renew: jest.fn(),
    });
    await client.request('GET', '/api/kiosk/device/roster');
    expect(signer.sign.mock.calls[0][0].endsWith(signer.sha256Hex(''))).toBe(
      true,
    );
  });

  it('renews the session once on 401 and retries', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        response(401, { success: false, message: 'expired' }),
      )
      .mockResolvedValueOnce(response(200, { success: true, data: 'ok' }));
    const renew = jest.fn(async () => undefined);
    const client = new KioskHttpClient('https://x', signer, fetchImpl);
    client.attachSession({
      kioskId: () => 'k1',
      token: async () => 'tok',
      renew,
    });
    await expect(
      client.request('GET', '/api/kiosk/device/roster'),
    ).resolves.toBe('ok');
    expect(renew).toHaveBeenCalledTimes(1);
  });

  it('maps failures to ApiError / NetworkError', async () => {
    const client = new KioskHttpClient(
      'https://x',
      signer,
      jest.fn(async () =>
        response(409, { success: false, message: 'Invalid sequence' }),
      ),
    );
    client.attachSession({
      kioskId: () => 'k1',
      token: async () => 'tok',
      renew: jest.fn(),
    });
    await expect(
      client.request('POST', '/p', { body: {} }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Invalid sequence',
    });

    const offline = new KioskHttpClient(
      'https://x',
      signer,
      jest.fn(async () => {
        throw new TypeError('Network request failed');
      }),
    );
    await expect(
      offline.request('POST', '/p', { auth: 'none' }),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(new NetworkError()).toBeInstanceOf(ApiError);
  });

  it('re-signs once with the server clock when the device clock is off', async () => {
    const serverDate = new Date(Date.now() + 10 * 60_000); // device is 10 min behind
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        response(401, { success: false, message: 'signature' }, serverDate),
      )
      .mockResolvedValueOnce(
        response(200, { success: true, data: 'ok' }, serverDate),
      );
    const renew = jest.fn(async () => undefined);
    const client = new KioskHttpClient('https://x', signer, fetchImpl);
    client.attachSession({
      kioskId: () => 'k1',
      token: async () => 'tok',
      renew,
    });

    await expect(
      client.request('GET', '/api/kiosk/device/roster'),
    ).resolves.toBe('ok');
    expect(renew).not.toHaveBeenCalled();
    const retried = fetchImpl.mock.calls[1][1].headers as Record<
      string,
      string
    >;
    expect(
      Math.abs(Number(retried['x-kiosk-timestamp']) - serverDate.getTime()),
    ).toBeLessThan(5_000);
    expect(Math.abs(client.serverNow() - serverDate.getTime())).toBeLessThan(
      5_000,
    );
  });

  it('normalizes base URLs', () => {
    expect(normalizeBaseUrl(' https://a.b/api/ ')).toBe('https://a.b');
    expect(normalizeBaseUrl('http://10.0.0.2:8000')).toBe(
      'http://10.0.0.2:8000',
    );
  });
});
