import type { Capability } from '../api/contract';
import { createKioskLock } from './android/kioskLock';
import { createNfcCardReader } from './android/nfcCardReader';
import { createVibrationIO } from './android/deviceIO';
import {
  createSimFaceEngine,
  createSimFingerprintEngine,
} from './sim/simEngines';
import {
  createZkCardReader,
  createZkDeviceIO,
  createZkFaceEngine,
  createZkFingerprintEngine,
} from './zkteco';
import type { Hardware } from './types';

export type { Hardware } from './types';

/** dev flavor → simulated biometrics; prod flavor → ZKTeco engines. */
export function createHardware(flavor: string): Hardware {
  const isDev = flavor === 'dev';
  const hardware: Hardware = isDev
    ? {
        engine: 'SIM',
        face: createSimFaceEngine(),
        finger: createSimFingerprintEngine(),
        card: createNfcCardReader(),
        io: createVibrationIO(),
        lock: createKioskLock(),
        capabilities,
      }
    : {
        engine: 'ZKTECO',
        face: createZkFaceEngine(),
        finger: createZkFingerprintEngine(),
        card: createZkCardReader(),
        io: createZkDeviceIO(),
        lock: createKioskLock(),
        capabilities,
      };
  return hardware;

  function capabilities(): Capability[] {
    const list: Capability[] = [];
    if (hardware.face) list.push('FACE');
    if (hardware.finger) list.push('FINGER');
    if (hardware.card) list.push('CARD');
    if (!isDev) list.push('LED', 'BUZZER');
    return list;
  }
}
