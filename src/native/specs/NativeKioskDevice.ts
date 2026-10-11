import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export type DeviceInfo = {
  manufacturer: string;
  model: string;
  serial: string;
  androidVersion: string;
  sdkInt: number;
  appVersion: string;
  // Gradle product flavor: "dev" (simulated hardware) or "prod".
  flavor: string;
};

export type DeviceKey = {
  // X.509 SubjectPublicKeyInfo, DER, base64.
  publicKey: string;
  // Android Key Attestation chain, leaf first, DER, base64.
  attestationChain: string[];
  hardwareBacked: boolean;
};

/**
 * Device identity and secure storage, backed by the Android Keystore.
 * Implemented in android/.../identity/KioskDeviceModule.kt
 */
export interface Spec extends TurboModule {
  getDeviceInfo(): DeviceInfo;
  hasKeyPair(): boolean;
  // Creates (or replaces) the EC P-256 signing key. challenge: base64.
  generateKeyPair(attestationChallenge: string): Promise<DeviceKey>;
  deleteKeyPair(): Promise<void>;
  // ECDSA SHA-256 signature (DER, base64) over the UTF-8 bytes of data.
  sign(data: string): Promise<string>;
  sha256Hex(data: string): string;
  randomUUID(): string;
  secureGet(key: string): Promise<string | null>;
  secureSet(key: string, value: string): Promise<void>;
  secureRemove(key: string): Promise<void>;
  secureClear(): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('KioskDevice');
