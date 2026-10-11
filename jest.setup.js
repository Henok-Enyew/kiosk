/* global jest, Buffer */
// Native modules are Kotlin (android/); tests get in-memory stand-ins.
jest.mock('./src/native/specs/NativeKioskDevice', () => {
  const { createHash, randomUUID } = require('node:crypto');
  const secure = new Map();
  return {
    __esModule: true,
    default: {
      getDeviceInfo: () => ({
        manufacturer: 'Test',
        model: 'Jest',
        serial: 'serial',
        androidVersion: '14',
        sdkInt: 34,
        appVersion: '1.0',
        flavor: 'dev',
      }),
      hasKeyPair: () => true,
      generateKeyPair: async () => ({
        publicKey: 'cHVibGlj',
        attestationChain: [],
        hardwareBacked: false,
      }),
      deleteKeyPair: async () => undefined,
      sign: async data => Buffer.from(`sig:${data}`).toString('base64'),
      sha256Hex: data => createHash('sha256').update(data).digest('hex'),
      randomUUID: () => randomUUID(),
      secureGet: async key => (secure.has(key) ? secure.get(key) : null),
      secureSet: async (key, value) => {
        secure.set(key, value);
      },
      secureRemove: async key => {
        secure.delete(key);
      },
      secureClear: async () => secure.clear(),
    },
  };
});

jest.mock('./src/native/specs/NativeKioskMode', () => ({
  __esModule: true,
  default: {
    getState: () => ({ isDeviceOwner: false, isLockTaskActive: false }),
    enter: async () => ({ isDeviceOwner: false, isLockTaskActive: true }),
    exit: async () => ({ isDeviceOwner: false, isLockTaskActive: false }),
    setKeepScreenOn: () => undefined,
  },
}));

jest.mock('./src/native/specs/NativeCardReader', () => ({
  __esModule: true,
  default: {
    isAvailable: () => false,
    isEnabled: () => false,
    start: () => undefined,
    stop: () => undefined,
    onCard: () => ({ remove: () => undefined }),
  },
}));

jest.mock('react-native-camera-kit', () => {
  const { View } = require('react-native');
  return {
    Camera: View,
    CameraType: { Front: 'front', Back: 'back' },
  };
});

jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
