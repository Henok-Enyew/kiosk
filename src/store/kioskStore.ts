import type {
  CardEntry,
  DeviceSession,
  RosterEntry,
  TemplateEntry,
} from '../api/contract';
import type { VerificationPolicy } from '../config';
import type { AttendanceState } from '../domain/attendance';
import type { QueuedPunch } from '../domain/queue';
import type { StoredTemplate } from '../hardware/types';
import { secureStore, type StoreKey } from './secureStore';

export interface Pairing {
  apiUrl: string;
  kioskId: string;
  deviceId: string;
  kioskName: string;
  organization: DeviceSession['organization'];
  verificationPolicy: VerificationPolicy;
  hasAdminPin: boolean;
  sessionToken: string;
  expiresAt: string;
  pairedAt: string;
}

export interface SyncState {
  rosterSince?: string;
  templatesSince?: string;
  cardsSince?: string;
  lastSyncAt?: string;
  lastHeartbeatAt?: string;
  lastError?: string;
}

export interface EmployeeStateEntry {
  state: AttendanceState;
  at: string;
}

export interface KioskData {
  loaded: boolean;
  pairing: Pairing | null;
  roster: Record<string, RosterEntry>;
  templates: Record<string, StoredTemplate>;
  cards: Record<string, CardEntry>;
  employeeStates: Record<string, EmployeeStateEntry>;
  queue: QueuedPunch[];
  sync: SyncState;
  online: boolean;
}

const EMPTY: KioskData = {
  loaded: false,
  pairing: null,
  roster: {},
  templates: {},
  cards: {},
  employeeStates: {},
  queue: [],
  sync: {},
  online: true,
};

type Persisted = Exclude<keyof KioskData, 'loaded' | 'online'>;

const STORE_KEYS: Record<Persisted, StoreKey> = {
  pairing: 'pairing',
  roster: 'roster',
  templates: 'templates',
  cards: 'cards',
  employeeStates: 'employeeStates',
  queue: 'queue',
  sync: 'syncState',
};

/** Single source of truth for the terminal. Persisted slices go to the encrypted store. */
export class KioskStore {
  private data: KioskData = EMPTY;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.data;

  async load() {
    const entries = await Promise.all(
      (Object.keys(STORE_KEYS) as Persisted[]).map(
        async key => [key, await secureStore.get(STORE_KEYS[key])] as const,
      ),
    );
    const next: KioskData = { ...EMPTY, loaded: true };
    for (const [key, value] of entries) {
      if (value != null)
        (next as unknown as Record<string, unknown>)[key] = value;
    }
    this.data = next;
    this.emit();
  }

  async update<K extends Persisted>(
    key: K,
    updater: (current: KioskData[K]) => KioskData[K],
  ) {
    const value = updater(this.data[key]);
    this.data = { ...this.data, [key]: value };
    this.emit();
    await secureStore.set(STORE_KEYS[key], value);
  }

  setOnline(online: boolean) {
    if (this.data.online === online) return;
    this.data = { ...this.data, online };
    this.emit();
  }

  /** Wipes everything (unpair / re-pair). */
  async reset() {
    await secureStore.clear();
    this.data = { ...EMPTY, loaded: true };
    this.emit();
  }

  // ---- merges for delta sync -------------------------------------------------

  mergeRoster(entries: RosterEntry[]) {
    return this.update('roster', current => {
      const next = { ...current };
      for (const entry of entries) next[entry.employeeId] = entry;
      return next;
    });
  }

  mergeTemplates(entries: TemplateEntry[]) {
    return this.update('templates', current => {
      const next = { ...current };
      for (const entry of entries) {
        if (entry.revokedAt || entry.template == null) {
          delete next[entry.id];
        } else {
          next[entry.id] = {
            id: entry.id,
            employeeId: entry.employeeId,
            kind: entry.kind,
            fingerIndex: entry.fingerIndex,
            algorithmVersion: entry.algorithmVersion,
            template: entry.template,
          };
        }
      }
      return next;
    });
  }

  mergeCards(entries: CardEntry[]) {
    return this.update('cards', current => {
      const next = { ...current };
      for (const entry of entries) {
        if (entry.revokedAt) delete next[entry.id];
        else next[entry.id] = entry;
      }
      return next;
    });
  }

  setEmployeeState(employeeId: string, state: AttendanceState, at: string) {
    return this.update('employeeStates', current => ({
      ...current,
      [employeeId]: { state, at },
    }));
  }

  // ---- lookups ----------------------------------------------------------------

  employee(employeeId: string): RosterEntry | undefined {
    return this.data.roster[employeeId];
  }

  cardByHash(uidHash: string): CardEntry | undefined {
    return Object.values(this.data.cards).find(
      card => card.uidHash === uidHash,
    );
  }

  templatesFor(employeeId: string): StoredTemplate[] {
    return Object.values(this.data.templates).filter(
      t => t.employeeId === employeeId,
    );
  }

  private emit() {
    this.listeners.forEach(listener => listener());
  }
}
