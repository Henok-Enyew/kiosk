import type { CodegenTypes, TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type CardEvent = {
  // Card UID, upper-case hex.
  uid: string;
  technology: string;
};

/**
 * Generic Android NFC card reader (reader mode).
 * Implemented in android/.../card/CardReaderModule.kt.
 * ZKTeco terminals with a non-NFC reader get a ZK EDK implementation instead.
 */
export interface Spec extends TurboModule {
  isAvailable(): boolean;
  isEnabled(): boolean;
  start(): void;
  stop(): void;
  readonly onCard: CodegenTypes.EventEmitter<CardEvent>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('CardReader');
