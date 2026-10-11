import type { HardwareState } from '../../api/contract';
import type {
  BiometricEngine,
  CardReaderEngine,
  DeviceIO,
  FaceEngine,
  FingerprintEngine,
} from '../types';
import { createNfcCardReader } from '../android/nfcCardReader';
import { createVibrationIO } from '../android/deviceIO';
import { CameraPreview } from '../android/CameraPreview';

/**
 * ZKTeco engines — Phase B. Each function below is the integration point for the
 * vendor SDK once the terminal model is chosen and the SDK + licence are in hand:
 *
 *  face   → ZKTeco face SDK (1:N identify with liveness), Kotlin module android/.../zk/ZkFaceModule.kt
 *  finger → ZKFinger / built-in sensor SDK,           android/.../zk/ZkFingerModule.kt
 *  card   → Android NFC if the reader is exposed, else the ZK Device EDK reader
 *  io     → ZK Device EDK (LED, buzzer, relay)
 *
 * Until then they report UNAVAILABLE so a prod build on real hardware fails loudly
 * on the diagnostics screen instead of pretending to verify anyone.
 */

const SDK_MISSING: HardwareState = 'UNAVAILABLE';
const ZK_ALGORITHM_VERSION = 'zkteco-pending';

function pendingEngine<K extends 'FACE' | 'FINGER'>(
  kind: K,
): BiometricEngine & { kind: K } {
  return {
    kind,
    algorithmVersion: ZK_ALGORITHM_VERSION,
    status: async () => SDK_MISSING,
    loadTemplates: async () => undefined,
    identify: async () => ({
      type: 'error',
      message: 'ZKTeco SDK is not integrated yet.',
    }),
    enroll: async () => ({
      type: 'failed',
      message: 'ZKTeco SDK is not integrated yet.',
    }),
  };
}

export function createZkFaceEngine(): FaceEngine {
  return { ...pendingEngine('FACE'), Preview: CameraPreview };
}

export function createZkFingerprintEngine(): FingerprintEngine {
  return pendingEngine('FINGER');
}

export function createZkCardReader(): CardReaderEngine | null {
  return createNfcCardReader();
}

export function createZkDeviceIO(): DeviceIO {
  return createVibrationIO();
}
