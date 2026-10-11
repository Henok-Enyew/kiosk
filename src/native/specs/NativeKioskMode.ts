import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type KioskModeState = {
  isDeviceOwner: boolean;
  isLockTaskActive: boolean;
};

/**
 * Terminal lock-down (device owner + lock task mode).
 * Implemented in android/.../kiosk/KioskModeModule.kt
 */
export interface Spec extends TurboModule {
  getState(): KioskModeState;
  // Pins the app (lock task), hides system bars, disables keyguard/status bar
  // and makes the app the persistent HOME activity when device owner.
  enter(): Promise<KioskModeState>;
  exit(): Promise<KioskModeState>;
  setKeepScreenOn(enabled: boolean): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('KioskMode');
