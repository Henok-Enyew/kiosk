import { KioskMode } from '../../native';
import type { KioskLock } from '../types';

export function createKioskLock(): KioskLock {
  return {
    state: () => KioskMode.getState(),
    enter: () => KioskMode.enter(),
    exit: () => KioskMode.exit(),
    keepScreenOn: enabled => KioskMode.setKeepScreenOn(enabled),
  };
}
