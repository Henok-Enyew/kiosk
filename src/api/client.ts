import { HEADERS, TIMING } from '../config';
import type { ApiEnvelope } from './contract';

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** No HTTP response at all (offline, DNS, timeout). Punches are queued on this. */
export class NetworkError extends ApiError {
  constructor(message = 'The server could not be reached.') {
    super(0, message);
    this.name = 'NetworkError';
  }
}

export interface RequestSigner {
  sign(data: string): Promise<string>;
  sha256Hex(data: string): string;
}

export interface SessionProvider {
  kioskId(): string | null;
  token(): Promise<string>;
  /** Called once when a session request comes back 401. */
  renew(): Promise<void>;
}

type AuthMode = 'none' | 'signed' | 'session';

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | undefined>;
  auth?: AuthMode;
  enrollToken?: string;
}

type Fetch = typeof fetch;

/**
 * HTTP client for /api/kiosk/device/*. Every authenticated request is signed:
 * ECDSA(`${METHOD}\n${PATH_WITH_QUERY}\n${TIMESTAMP_MS}\n${SHA256_HEX(BODY)}`)
 */
/** Clock corrections smaller than this are ignored (the Date header has 1 s resolution). */
const CLOCK_TOLERANCE_MS = 30_000;

export class KioskHttpClient {
  private session: SessionProvider | null = null;
  /** serverTime - deviceTime, learned from the HTTP Date header. */
  private clockOffsetMs = 0;

  constructor(
    private baseUrl: string,
    private readonly signer: RequestSigner,
    private readonly fetchImpl: Fetch = fetch,
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  get apiUrl() {
    return this.baseUrl;
  }

  attachSession(session: SessionProvider | null) {
    this.session = session;
  }

  /**
   * Current time on the server's clock. Terminals can drift while offline; signatures
   * (±5 min window) and punch times use this instead of the raw device clock.
   */
  serverNow(): number {
    return Date.now() + this.clockOffsetMs;
  }

  async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    return this.send<T>(method, path, options, false);
  }

  private async send<T>(
    method: string,
    path: string,
    options: RequestOptions,
    isRetry: boolean,
    clockRetried = false,
  ): Promise<T> {
    const auth = options.auth ?? 'session';
    const pathWithQuery = path + buildQuery(options.query);
    const bodyText =
      options.body === undefined ? '' : JSON.stringify(options.body);

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (bodyText) headers['Content-Type'] = 'application/json';

    if (auth !== 'none') {
      const timestamp = Math.round(this.serverNow()).toString();
      const canonical = [
        method,
        pathWithQuery,
        timestamp,
        this.signer.sha256Hex(bodyText),
      ].join('\n');
      headers[HEADERS.signature] = await this.signer.sign(canonical);
      headers[HEADERS.timestamp] = timestamp;
    }
    if (auth === 'signed') {
      const kioskId = this.session?.kioskId();
      if (!kioskId) throw new ApiError(401, 'This kiosk is not paired.');
      headers[HEADERS.kioskId] = kioskId;
    }
    if (auth === 'session') {
      if (!this.session) throw new ApiError(401, 'This kiosk is not paired.');
      headers.Authorization = `Bearer ${await this.session.token()}`;
    }
    if (options.enrollToken) headers[HEADERS.enrollToken] = options.enrollToken;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMING.requestTimeout);
    let response: Response;
    try {
      response = await this.fetchImpl(this.baseUrl + pathWithQuery, {
        method,
        headers,
        body: bodyText || undefined,
        signal: controller.signal,
      });
    } catch {
      throw new NetworkError();
    } finally {
      clearTimeout(timer);
    }

    const clockCorrected = this.learnClock(response);
    if (
      response.status === 401 &&
      auth !== 'none' &&
      clockCorrected &&
      !clockRetried
    ) {
      // The signature was probably rejected for clock skew: re-sign with the corrected clock.
      return this.send<T>(method, path, options, isRetry, true);
    }

    let envelope: ApiEnvelope<T> | null = null;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch {
      envelope = null;
    }

    if (
      response.status === 401 &&
      auth === 'session' &&
      !isRetry &&
      this.session
    ) {
      await this.session.renew();
      return this.send<T>(method, path, options, true, clockRetried);
    }

    if (!response.ok) {
      throw new ApiError(
        response.status,
        envelope?.message ?? `Request failed (${response.status}).`,
        envelope?.errors,
      );
    }
    return envelope?.data as T;
  }

  /** Returns true when the device clock was off and the offset changed noticeably. */
  private learnClock(response: Response): boolean {
    const header = response.headers?.get?.('date');
    const serverMs = header ? Date.parse(header) : NaN;
    if (Number.isNaN(serverMs)) return false;
    const offset = serverMs - Date.now();
    const target = Math.abs(offset) < CLOCK_TOLERANCE_MS ? 0 : offset;
    const changed = Math.abs(target - this.clockOffsetMs) >= CLOCK_TOLERANCE_MS;
    this.clockOffsetMs = target;
    return changed;
  }
}

export function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');
}

function buildQuery(query?: Record<string, string | undefined>): string {
  if (!query) return '';
  const parts = Object.entries(query)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    );
  return parts.length ? `?${parts.join('&')}` : '';
}
