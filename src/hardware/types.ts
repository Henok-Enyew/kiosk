import type { ComponentType } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { Capability, Engine, HardwareState } from '../api/contract';
import type { TemplateKind } from '../config';

/**
 * The hardware contract. Everything device-specific lives behind these interfaces:
 *   - hardware/sim      simulated engines (dev flavor, any Android phone)
 *   - hardware/zkteco   ZKTeco SDK engines (prod flavor, terminals)
 * Screens and flows only ever talk to `Hardware`.
 */

export interface StoredTemplate {
  id: string;
  employeeId: string;
  kind: TemplateKind;
  fingerIndex: number | null;
  algorithmVersion: string;
  /** Base64 template as produced by the engine's `enroll`. */
  template: string;
}

export type IdentifyOutcome =
  | { type: 'match'; employeeId: string; score: number }
  | { type: 'no_match' }
  | { type: 'liveness_failed' }
  | { type: 'cancelled' }
  | { type: 'error'; message: string };

export interface IdentifyOptions {
  signal: AbortSignal;
  /** Set for 1:1 verification (e.g. after a card tap); otherwise 1:N identification. */
  candidateEmployeeId?: string;
}

export interface EnrollProgress {
  step: number;
  of: number;
  message: string;
}

export type EnrollOutcome =
  | {
      type: 'enrolled';
      template: string;
      algorithmVersion: string;
      quality?: number;
    }
  | { type: 'failed'; message: string }
  | { type: 'cancelled' };

export interface EnrollOptions {
  employeeId: string;
  fingerIndex?: number;
  signal: AbortSignal;
  onProgress?: (progress: EnrollProgress) => void;
}

export interface BiometricEngine {
  readonly kind: TemplateKind;
  /** Templates with a different algorithm version are ignored by this engine. */
  readonly algorithmVersion: string;
  status(): Promise<HardwareState>;
  /** Replaces the engine's matching database (the server is the source of truth). */
  loadTemplates(templates: StoredTemplate[]): Promise<void>;
  identify(options: IdentifyOptions): Promise<IdentifyOutcome>;
  enroll(options: EnrollOptions): Promise<EnrollOutcome>;
}

export interface FacePreviewProps {
  style?: StyleProp<ViewStyle>;
  active: boolean;
}

export interface FaceEngine extends BiometricEngine {
  readonly kind: 'FACE';
  /** Live camera view rendered by the engine (ZK SDKs usually own the camera). */
  readonly Preview: ComponentType<FacePreviewProps>;
}

export interface FingerprintEngine extends BiometricEngine {
  readonly kind: 'FINGER';
}

export interface CardReaderEngine {
  status(): HardwareState;
  /** Starts listening; returns a function that stops it. UIDs are upper-case hex. */
  listen(onCard: (uid: string) => void): () => void;
}

export type SignalKind = 'success' | 'failure' | 'attention';

/** LEDs, buzzer, relay (door/turnstile). */
export interface DeviceIO {
  signal(kind: SignalKind): void;
  openRelay?(durationMs: number): void;
}

export interface KioskLockState {
  isDeviceOwner: boolean;
  isLockTaskActive: boolean;
}

export interface KioskLock {
  state(): KioskLockState;
  enter(): Promise<KioskLockState>;
  exit(): Promise<KioskLockState>;
  keepScreenOn(enabled: boolean): void;
}

export interface Hardware {
  readonly engine: Engine;
  readonly face: FaceEngine | null;
  readonly finger: FingerprintEngine | null;
  readonly card: CardReaderEngine | null;
  readonly io: DeviceIO;
  readonly lock: KioskLock;
  capabilities(): Capability[];
}
