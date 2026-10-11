import KioskDevice from './specs/NativeKioskDevice';
import KioskMode from './specs/NativeKioskMode';
import CardReader from './specs/NativeCardReader';
import type { RequestSigner } from '../api/client';

export { KioskDevice, KioskMode, CardReader };
export type { DeviceInfo, DeviceKey } from './specs/NativeKioskDevice';
export type { CardEvent } from './specs/NativeCardReader';

export const deviceSigner: RequestSigner = {
  sign: data => KioskDevice.sign(data),
  sha256Hex: data => KioskDevice.sha256Hex(data),
};

export const uuid = () => KioskDevice.randomUUID();
