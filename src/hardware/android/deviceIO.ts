import { Vibration } from 'react-native';
import type { DeviceIO } from '../types';

/** Haptic feedback stand-in for the terminal's LED + buzzer. */
export function createVibrationIO(): DeviceIO {
  return {
    signal(kind) {
      switch (kind) {
        case 'success':
          Vibration.vibrate(80);
          break;
        case 'failure':
          Vibration.vibrate([0, 120, 80, 120]);
          break;
        case 'attention':
          Vibration.vibrate(40);
          break;
      }
    },
  };
}
