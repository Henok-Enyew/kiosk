# Rona Kiosk: Android app

The attendance app for **ZKTeco Android terminals** (e.g. G5, FaceKiosk). Employees clock in, start/end breaks and clock out with **face + fingerprint**, with **NFC/RFID cards** as an extra factor. Punches show up in Rona under Workforce → Attendance.

- Biometrics are enrolled, stored and matched **on the device** by the ZKTeco SDKs. The server only receives `employee id + action + methods used + time`.
- Requests are signed by a hardware-backed Keystore key. The server accepts them only from registered, attested terminals.
- The web `/kiosk` in `apps/client` stays as the fallback for companies without terminals.

## Stack

- React Native 0.87 (New Architecture, Hermes), TypeScript
- Kotlin native modules (under `android/`) for the parts React Native can't reach: the ZKTeco SDKs (FacePro, ZKFinger, Device EDK), the camera, Keystore/Key Attestation and lock-task kiosk mode
- Shared contracts from the monorepo: `@rona/types`, `@rona/validation` (zod)
- Application ID: `com.ronaerp.kiosk`

Android only: the terminals don't run iOS, so there is no `ios/` project.

## Prerequisites

- Node `>= 22.11` and pnpm (see the root `package.json`)
- JDK 17
- Android SDK with `ANDROID_HOME` set. The build uses compile SDK 37 and build-tools 37. Gradle downloads missing SDK parts if the licences are accepted (`sdkmanager --licenses`).

## Run

From the repo root:

```sh
pnpm install
pnpm build:packages                      # @rona/* resolve to their built dist/
pnpm --filter kiosk-android start        # Metro
pnpm --filter kiosk-android android      # build, install and launch on a device/emulator
```

Checks: `lint`, `typecheck` and `test` (jest) run through turbo like the other workspaces.

## Monorepo notes (pnpm)

pnpm doesn't hoist dependencies, so a few defaults from the React Native template are adjusted:

- `metro.config.js` watches the workspace root and resolves from both `node_modules` folders, so Metro can follow pnpm symlinks into `node_modules/.pnpm` and `packages/*`.
- `@react-native/gradle-plugin` and `@react-native/codegen` are direct dev dependencies, because `android/settings.gradle` and the React Gradle plugin look for them in this app's `node_modules`.
- `jest.config.js` overrides `transformIgnorePatterns` to match `node_modules/.pnpm/...` paths.
- `babel.config.js` adds `@babel/plugin-transform-export-namespace-from`, which zod v4 needs.

## Planned structure

Following the Kiosk Implementation Plan (Phase 2):

- **Hardware interfaces** with ZKTeco implementations: `FaceEngine` (FacePro SDK), `FingerprintEngine` (ZKFinger SDK), `CardReader` (`NfcAdapter` or the ZK EDK reader)
- **Punch state machine**, enforcing the kiosk's verification policy (`FACE_AND_FINGER`, `CARD_AND_FACE`, `CARD_AND_FINGER`, `FACE_ONLY`). A card is never accepted alone.
- **Roster sync** and an **offline queue** (encrypted on-device storage)
- **Device identity**: Keystore key, Key Attestation at registration, ECDSA-signed requests to `/api/kiosk/device/*`
- **Kiosk behaviour**: device owner with lock-task mode, start at boot, keep the screen on
- **Contract fixtures**, validated by a server spec against the `@rona/validation` schemas
# kiosk
