import { KioskDevice } from '../native';

/**
 * JSON values in the Keystore-encrypted store (android/.../KioskDeviceModule.kt).
 * Writes are committed synchronously on the native side, so data survives power loss.
 */
export const secureStore = {
  async get<T>(key: StoreKey): Promise<T | null> {
    const raw = await KioskDevice.secureGet(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  set<T>(key: StoreKey, value: T): Promise<void> {
    return KioskDevice.secureSet(key, JSON.stringify(value));
  },
  remove(key: StoreKey): Promise<void> {
    return KioskDevice.secureRemove(key);
  },
  clear(): Promise<void> {
    return KioskDevice.secureClear();
  },
};

export type StoreKey =
  | 'pairing'
  | 'roster'
  | 'templates'
  | 'cards'
  | 'queue'
  | 'employeeStates'
  | 'syncState'
  | 'simEnrollments';
