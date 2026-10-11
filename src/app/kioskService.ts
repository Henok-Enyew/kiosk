import { AppState, type NativeEventSubscription } from 'react-native';
import {
  ApiError,
  KioskHttpClient,
  NetworkError,
  normalizeBaseUrl,
  type SessionProvider,
} from '../api/client';
import type {
  DeviceSession,
  EmployeeStatus,
  HardwareState,
  PunchInput,
  PunchResult,
} from '../api/contract';
import { createKioskApi, type KioskApi } from '../api/kioskApi';
import {
  TIMING,
  type AttendanceEventType,
  type VerificationMethod,
} from '../config';
import { allowedNextEvents } from '../domain/attendance';
import {
  applyBatchResult,
  enqueue,
  isExpired,
  nextBatch,
  type QueuedPunch,
} from '../domain/queue';
import { createHardware, type Hardware } from '../hardware';
import { KioskDevice, deviceSigner, uuid, type DeviceInfo } from '../native';
import { KioskStore, type Pairing } from '../store/kioskStore';
import { encodeBase64 } from '../util/base64';

export interface PairingPayload {
  apiUrl: string;
  token: string;
}

export type PunchOutcome =
  | { status: 'recorded'; result: PunchResult }
  | {
      status: 'queued';
      employeeName: string;
      eventType: AttendanceEventType;
      eventAt: string;
    };

export interface PunchRequest {
  employeeId: string;
  eventType: AttendanceEventType;
  methods: VerificationMethod[];
  matchScore?: number;
  cardId?: string;
}

type RevokedListener = (reason: string) => void;

/**
 * Orchestrates the terminal: pairing, session renewal, delta sync of roster /
 * templates / cards into the biometric engines, heartbeat and the offline queue.
 */
export class KioskService {
  readonly device: DeviceInfo = KioskDevice.getDeviceInfo();
  readonly hardware: Hardware = createHardware(this.device.flavor);
  readonly store = new KioskStore();

  private http: KioskHttpClient | null = null;
  private apiInstance: KioskApi | null = null;
  private timers: ReturnType<typeof setInterval>[] = [];
  private appStateSub: NativeEventSubscription | null = null;
  private syncing: Promise<void> | null = null;
  private draining: Promise<void> | null = null;
  private renewing: Promise<void> | null = null;
  private revokedListeners = new Set<RevokedListener>();

  get isDev() {
    return this.device.flavor === 'dev';
  }

  get api(): KioskApi {
    if (!this.apiInstance) throw new ApiError(401, 'This kiosk is not paired.');
    return this.apiInstance;
  }

  async init() {
    await this.store.load();
    const pairing = this.store.getSnapshot().pairing;
    if (pairing && KioskDevice.hasKeyPair()) {
      this.connect(pairing.apiUrl);
      await this.loadEnginesFromStore();
      this.start();
    } else if (pairing) {
      // Key lost (app data cleared on some ROMs): the pairing is useless.
      await this.store.reset();
    }
  }

  onRevoked(listener: RevokedListener) {
    this.revokedListeners.add(listener);
    return () => {
      this.revokedListeners.delete(listener);
    };
  }

  // ---- pairing -----------------------------------------------------------------

  async pair({ apiUrl, token }: PairingPayload) {
    const baseUrl = normalizeBaseUrl(apiUrl);
    const http = new KioskHttpClient(baseUrl, deviceSigner);
    const api = createKioskApi(http);

    const challenge = encodeBase64(
      KioskDevice.sha256Hex(`rona-kiosk:${token}`),
    );
    const key = await KioskDevice.generateKeyPair(challenge);
    const session = await api.register({
      deviceToken: token,
      publicKey: key.publicKey,
      attestationChain: key.attestationChain,
      device: {
        manufacturer: this.device.manufacturer,
        model: this.device.model,
        serial: this.device.serial || undefined,
        androidVersion: this.device.androidVersion,
        sdkInt: this.device.sdkInt,
        appVersion: this.device.appVersion,
        engine: this.hardware.engine,
        capabilities: this.hardware.capabilities(),
      },
    });

    await this.store.reset();
    await this.store.update('pairing', () => toPairing(baseUrl, session));
    this.connect(baseUrl);
    await this.sync();
    this.start();
  }

  async unpair() {
    this.stop();
    this.http?.attachSession(null);
    this.http = null;
    this.apiInstance = null;
    await this.store.reset();
    await KioskDevice.deleteKeyPair();
  }

  // ---- lifecycle ---------------------------------------------------------------

  start() {
    this.stop();
    this.timers.push(
      setInterval(() => this.sync().catch(() => undefined), TIMING.rosterSync),
      setInterval(
        () => this.heartbeat().catch(() => undefined),
        TIMING.heartbeat,
      ),
      setInterval(
        () => this.drainQueue().catch(() => undefined),
        TIMING.queueRetryMin,
      ),
    );
    this.appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') this.sync().catch(() => undefined);
    });
    this.heartbeat().catch(() => undefined);
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  // ---- sync ------------------------------------------------------------------------

  sync(): Promise<void> {
    if (!this.syncing) {
      this.syncing = this.runSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async runSync() {
    const { sync } = this.store.getSnapshot();
    try {
      const [roster, templates, cards] = await Promise.all([
        this.api.roster(sync.rosterSince),
        this.api.templates(sync.templatesSince),
        this.api.cards(sync.cardsSince),
      ]);
      await this.store.mergeRoster(roster.employees);
      await this.store.mergeTemplates(templates.templates);
      await this.store.mergeCards(cards.cards);
      await this.store.update('sync', current => ({
        ...current,
        rosterSince: roster.serverTime,
        templatesSince: templates.serverTime,
        cardsSince: cards.serverTime,
        lastSyncAt: new Date().toISOString(),
        lastError: undefined,
      }));
      this.store.setOnline(true);
      await this.loadEnginesFromStore();
      await this.drainQueue();
    } catch (error) {
      await this.recordError(error);
      throw error;
    }
  }

  /** Pushes the synced templates into each engine's matcher. */
  async loadEnginesFromStore() {
    const templates = Object.values(this.store.getSnapshot().templates);
    const { face, finger } = this.hardware;
    await Promise.all([
      face?.loadTemplates(
        templates.filter(
          t =>
            t.kind === 'FACE' && t.algorithmVersion === face.algorithmVersion,
        ),
      ),
      finger?.loadTemplates(
        templates.filter(
          t =>
            t.kind === 'FINGER' &&
            t.algorithmVersion === finger.algorithmVersion,
        ),
      ),
    ]);
  }

  async heartbeat() {
    const snapshot = this.store.getSnapshot();
    const [face, finger] = await Promise.all([
      this.hardware.face?.status() ??
        Promise.resolve<HardwareState>('UNAVAILABLE'),
      this.hardware.finger?.status() ??
        Promise.resolve<HardwareState>('UNAVAILABLE'),
    ]);
    const cardState = this.hardware.card?.status() ?? 'UNAVAILABLE';
    try {
      const result = await this.api.heartbeat({
        appVersion: this.device.appVersion,
        engine: this.hardware.engine,
        queueLength: snapshot.queue.length,
        templateCount: Object.keys(snapshot.templates).length,
        hardware: {
          face,
          finger,
          card: cardState === 'LICENSE_MISSING' ? 'ERROR' : cardState,
        },
        // The server caps this at 500 characters.
        lastError: snapshot.sync.lastError?.slice(0, 500),
      });
      this.store.setOnline(true);
      await this.store.update('pairing', current =>
        current
          ? {
              ...current,
              verificationPolicy: result.verificationPolicy,
              hasAdminPin: result.hasAdminPin,
            }
          : current,
      );
      await this.store.update('sync', current => ({
        ...current,
        lastHeartbeatAt: result.serverTime,
      }));
    } catch (error) {
      await this.recordError(error);
    }
  }

  // ---- punches ---------------------------------------------------------------------

  /** Card UIDs are matched by hash: sha256(`${organizationId}:${UID}`), as on the server. */
  cardByUid(uid: string) {
    const organizationId = this.store.getSnapshot().pairing?.organization.id;
    if (!organizationId) return undefined;
    return this.store.cardByHash(
      KioskDevice.sha256Hex(`${organizationId}:${uid.toUpperCase()}`),
    );
  }

  async employeeStatus(employeeId: string): Promise<EmployeeStatus> {
    const local = this.store.getSnapshot();
    try {
      const status = await this.api.employeeStatus(employeeId);
      this.store.setOnline(true);
      await this.store.setEmployeeState(
        employeeId,
        status.currentState,
        status.lastEventAt ?? new Date().toISOString(),
      );
      return status;
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
      this.store.setOnline(false);
      const state = local.employeeStates[employeeId]?.state;
      return {
        employeeId,
        employeeName: local.roster[employeeId]?.fullName ?? '',
        currentState: state ?? 'none',
        allowedNextEvents: allowedNextEvents(state),
        lastEventAt: local.employeeStates[employeeId]?.at ?? null,
      };
    }
  }

  async punch(request: PunchRequest): Promise<PunchOutcome> {
    const input: PunchInput = {
      clientEventId: uuid(),
      employeeId: request.employeeId,
      eventType: request.eventType,
      methods: request.methods,
      matchScore: request.matchScore,
      cardId: request.cardId,
      deviceEventAt: new Date(
        this.http?.serverNow() ?? Date.now(),
      ).toISOString(),
    };
    const employeeName =
      this.store.employee(request.employeeId)?.fullName ?? '';

    try {
      const result = await this.api.punch(input);
      this.store.setOnline(true);
      await this.store.setEmployeeState(
        result.employeeId,
        result.eventType,
        result.eventAt,
      );
      return { status: 'recorded', result };
    } catch (error) {
      if (!(error instanceof NetworkError)) throw error;
      this.store.setOnline(false);
      await this.store.update('queue', queue =>
        enqueue(queue, { input, employeeName, attempts: 0 }),
      );
      await this.store.setEmployeeState(
        request.employeeId,
        request.eventType,
        input.deviceEventAt,
      );
      return {
        status: 'queued',
        employeeName,
        eventType: request.eventType,
        eventAt: input.deviceEventAt,
      };
    }
  }

  drainQueue(): Promise<void> {
    if (!this.draining) {
      this.draining = this.runDrain().finally(() => {
        this.draining = null;
      });
    }
    return this.draining;
  }

  private async runDrain() {
    const queue = this.store.getSnapshot().queue;
    if (queue.length === 0 || !this.apiInstance) return;

    const expired = queue.filter(item => isExpired(item));
    const live = queue.filter(item => !isExpired(item));
    if (expired.length) {
      await this.store.update('queue', () => live);
      await this.recordError(
        new Error(
          `${expired.length} offline punch(es) older than the sync window were dropped.`,
        ),
      );
    }

    const batch = nextBatch(live);
    if (batch.length === 0) return;
    try {
      const { results } = await this.api.punchBatch(
        batch.map(item => item.input),
      );
      this.store.setOnline(true);
      let rejectedMessage: string | undefined;
      await this.store.update('queue', current => {
        const outcome = applyBatchResult(current, batch, results);
        if (outcome.rejected.length) {
          rejectedMessage = outcome.rejected
            .map(r => `${r.employeeName || r.input.employeeId}: ${r.reason}`)
            .join('; ');
        }
        return outcome.remaining;
      });
      if (rejectedMessage) {
        await this.recordError(
          new Error(`Rejected offline punches — ${rejectedMessage}`),
        );
      }
    } catch (error) {
      await this.recordError(error);
    }
  }

  // ---- session ------------------------------------------------------------------------

  private connect(apiUrl: string) {
    this.http = new KioskHttpClient(apiUrl, deviceSigner);
    this.apiInstance = createKioskApi(this.http);
    const session: SessionProvider = {
      kioskId: () => this.store.getSnapshot().pairing?.kioskId ?? null,
      token: async () => {
        const pairing = this.store.getSnapshot().pairing;
        if (!pairing) throw new ApiError(401, 'This kiosk is not paired.');
        const remaining = Date.parse(pairing.expiresAt) - Date.now();
        if (remaining < TIMING.sessionRenewMargin) await this.renewSession();
        return this.store.getSnapshot().pairing?.sessionToken ?? '';
      },
      renew: () => this.renewSession(),
    };
    this.http.attachSession(session);
  }

  private renewSession(): Promise<void> {
    if (!this.renewing) {
      this.renewing = this.runRenew().finally(() => {
        this.renewing = null;
      });
    }
    return this.renewing;
  }

  private async runRenew() {
    const pairing = this.store.getSnapshot().pairing;
    if (!pairing) throw new ApiError(401, 'This kiosk is not paired.');
    try {
      const session = await this.api.renewSession(pairing.kioskId);
      await this.store.update('pairing', current =>
        current
          ? {
              ...toPairing(current.apiUrl, session),
              pairedAt: current.pairedAt,
            }
          : current,
      );
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 401) {
        const reason = error.message;
        await this.unpair();
        this.revokedListeners.forEach(listener => listener(reason));
      }
      throw error;
    }
  }

  private async recordError(error: unknown) {
    if (error instanceof NetworkError) this.store.setOnline(false);
    const message = error instanceof Error ? error.message : String(error);
    if (!this.store.getSnapshot().pairing) return;
    await this.store.update('sync', current => ({
      ...current,
      lastError: message,
    }));
  }
}

function toPairing(apiUrl: string, session: DeviceSession): Pairing {
  return {
    apiUrl,
    kioskId: session.kiosk.id,
    deviceId: session.kiosk.deviceId,
    kioskName: session.kiosk.name,
    organization: session.organization,
    verificationPolicy: session.kiosk.verificationPolicy,
    hasAdminPin: session.kiosk.hasAdminPin,
    sessionToken: session.sessionToken,
    expiresAt: session.expiresAt,
    pairedAt: new Date().toISOString(),
  };
}

export type { QueuedPunch };
