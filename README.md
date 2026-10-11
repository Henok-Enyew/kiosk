# Rona Kiosk: Android app

The attendance app for **ZKTeco Android terminals**. Employees clock in, start/end breaks and clock out using **face and/or fingerprint**, with **cards** as an optional first factor (a card is never accepted alone). Punches appear in Rona under Workforce → Attendance with the kiosk name and the verification methods used.

- Biometrics are enrolled and matched **on the terminal** by the vendor SDK. The server stores the templates encrypted (as opaque blobs) and syncs them to every terminal of the organization. It receives `employee + action + methods + score + time`.
- Every request is **ECDSA-signed** with a hardware-backed Android Keystore key created at pairing (with Key Attestation), so the server only accepts registered terminals.
- Punches made offline are queued encrypted on the device and uploaded later. The server re-validates them and keeps the original time (up to 72 h).
- The web `/kiosk` in rona-erp stays as the fallback for companies without terminals.

The backend lives in the **rona-erp** monorepo (`apps/server`, `/api/kiosk/device/*`). This repo is standalone and keeps its own copy of the API contract in `src/api/contract.ts` and `src/config.ts`. **Keep them in sync** with `rona-erp/packages/{types,config,routes}` (kiosk).

## Build flavors

| Flavor | Hardware | Use |
|---|---|---|
| `dev` | **Simulated** face and fingerprint engines driven by an on-screen **DEV panel**, plus real NFC and camera | Any Android phone, before the terminal and SDK arrive |
| `prod` | ZKTeco engines (`src/hardware/zkteco`). The app is the device's HOME screen and runs in lock-task mode | ZKTeco terminals |

Until the ZKTeco SDK is integrated, the `prod` engines report `UNAVAILABLE`, so a terminal never pretends to verify anyone.

## Run it on your Android phone

### 1. One-time PC setup (Fedora)

- **Node** ≥ 22.11.
- **pnpm 11**: `npm i -g pnpm@11`, or use corepack.
- **JDK 17**:
  ```sh
  curl -s https://get.sdkman.io | bash
  sdk install java 17.0.<x>-tem
  ```
  Then set `JAVA_HOME`.
- **Android Studio** (tarball or Flatpak). In SDK Manager, install:
  - Android SDK Platform **37**
  - Build-Tools **37.0.0**
  - Platform-Tools
  - Command-line Tools
  - **NDK 27.1.12297006**
  - CMake
- Add to `~/.bashrc`:
  ```sh
  export ANDROID_HOME=$HOME/Android/Sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin
  ```
  Then accept the licences: `sdkmanager --licenses`.
- Optional, for Metro's file watcher: `sudo sysctl fs.inotify.max_user_watches=524288`.

### 2. Prepare the phone

1. Settings → About → tap *Build number* 7×. Then Developer options → **USB debugging** (on Xiaomi/Tecno/Infinix, also enable "Install via USB").
2. Connect it with a data cable and run `adb devices`, then accept the prompt on the phone. If it shows `no permissions`, add a udev rule for the phone's USB vendor ID.

### 3. Start the backend and register a kiosk

In `rona-erp`, run the server (`:8000`) and the web client. In Rona, go to **Organization → Kiosks → Register kiosk**. Keep the QR code / device credential on screen.

### 4. Run the app

```sh
pnpm install
pnpm start                     # Metro (keep it running)
pnpm android                   # builds the devDebug variant and installs it on the phone
adb reverse tcp:8000 tcp:8000  # the phone reaches your local API at http://localhost:8000
```

Then pair the phone using one of these:
- Scan the QR code. Its `api` must be reachable from the phone. With `adb reverse`, that's `http://localhost:8000`.
- **Enter details manually**: `http://localhost:8000` plus the device credential.

The first build takes a while. Add `-PreactNativeArchitectures=arm64-v8a` (through `cd android && ./gradlew installDevDebug -PreactNativeArchitectures=arm64-v8a`) to build for your phone's ABI only.

### 5. Try a punch with the DEV panel

1. Tap the organization **logo 5×** to open **Staff access**, then **Enroll employees**.
2. Enter an **enrollment code**. Create one in Rona → Organization → Kiosks → *Enrollment code*.
3. Pick an employee, then:
   - **Enroll face**: simulated.
   - **Add fingerprint**: simulated.
   - **Add card**: tap a real NFC card on the phone.
4. Back on the main screen, open **DEV** (bottom right) and choose **✓ <employee>** to play the camera or sensor recognizing them. Other buttons simulate *No match*, *Photo spoof* or *Someone else*.
5. Choose an action. The punch shows up in Rona → Workforce → Attendance (source *Kiosk*, method *Face* / *Fingerprint* / *Card*).
6. To test offline mode, turn on airplane mode, punch, then turn it off. The queued punch syncs with its original time.

**Terminal settings** (logo 5× → *Terminal settings*) needs the admin PIN set in Rona. Dev builds skip it when no PIN is set. That screen shows diagnostics and has sync, card/LED tests, kiosk mode and unpair.

> Do **not** make your personal phone the device owner. Test kiosk lock-down (below) on a spare phone or the terminal.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test        # jest: policy, queue, HTTP signing, punch state machine, service, app
```

## Structure

```
src/
  api/          HTTP client (Bearer session + ECDSA request signing), contract mirror, typed endpoints
  app/          KioskService (pairing, session renewal, delta sync, heartbeat, offline queue), React context
  domain/       pure logic: verification policy, attendance transitions, offline queue, PunchFlow state machine
  hardware/
    types.ts    THE CONTRACT: FaceEngine, FingerprintEngine, CardReaderEngine, DeviceIO, KioskLock
    sim/        simulated engines + controller driven by the DEV panel
    android/    generic Android: camera preview (CameraX), NFC reader, vibration, kiosk lock
    zkteco/     ZKTeco engines (Phase B integration points)
  native/       Turbo Native Module specs (codegen) + wrappers
  screens/      Pairing, Terminal (punch flow), StaffMenu, Supervisor (enrollment), Admin, DevPanel
  store/        encrypted persistence (Keystore AES-GCM) and the KioskStore
  theme/ i18n/  Rona tokens and fonts; all strings in one file (Amharic-ready)
android/app/src/main/java/com/ronaerp/kiosk/
  identity/KioskDeviceModule.kt   Keystore EC P-256 key + attestation, signing, encrypted store
  kiosk/KioskModeModule.kt        device owner, lock task, HOME, keep screen on (+ admin and boot receivers)
  card/CardReaderModule.kt        NFC reader mode → onCard events
  KioskPackage.kt                 registers the modules (ZK modules go here too)
```

## Verification flow

| Policy (set per kiosk in Rona) | Identify (1:N) | Then confirm (1:1) |
|---|---|---|
| `FACE_ONLY` | face | — |
| `FACE_OR_FINGER` | face **or** finger | — |
| `FACE_AND_FINGER` | face | finger |
| `CARD_AND_FACE` | card | face |
| `CARD_AND_FINGER` | card | finger |

After verification the app fetches the employee's status and only offers valid next actions: Clock in → Break / Clock out, and so on. Every screen times out back to idle.

## Kiosk lock-down (terminals)

Use a factory-reset device with no accounts on it:

```sh
adb install app-prod-release.apk
adb shell dpm set-device-owner com.ronaerp.kiosk/.kiosk.KioskAdminReceiver
```

When the app is device owner, the prod build:
- pins itself (lock task)
- hides the system bars
- disables the status bar and keyguard
- becomes the persistent HOME app

Exit is through Terminal settings, which needs the admin PIN.

## Phase B: integrating the ZKTeco SDK

1. Put the vendor AAR/JAR/`.so` files in `android/app/libs`, as `prodImplementation` dependencies. Check the licence before committing them.
2. Write Kotlin Turbo Modules `zk/ZkFaceModule.kt`, `ZkFingerModule.kt` and `ZkEdkModule.kt`, with specs in `src/native/specs`, and register them in `KioskPackage.kt`.
3. Implement `src/hardware/zkteco/index.ts` against `src/hardware/types.ts`:

   | Function | Must do |
   |---|---|
   | `identify` | 1:N with liveness, or 1:1 when `candidateEmployeeId` is set |
   | `enroll` | Return the SDK template (base64) and the SDK's algorithm version |
   | `loadTemplates` | Feed the matcher from the server sync |
   | `Preview` | Render the SDK camera view |
4. Confirm the finger numbering (`fingerIndex` 0–9) matches the SDK's and adjust `strings.fingers` if needed.
5. Re-enroll employees on the terminal. `sim-1` templates are ignored by prod engines.

Questions for ZKTeco before buying:
- **Android ≥ 7.0 is required** (minSdk 24).
- SDK availability for that exact model.
- Template export/import.
- Liveness.
- Licence model.
- Device-owner provisioning.
- ABIs.
- A loaner unit.

## Release signing

Put these in `~/.gradle/gradle.properties` (never commit them):

```
RONA_KIOSK_STORE_FILE=/path/to/rona-kiosk.keystore
RONA_KIOSK_STORE_PASSWORD=…
RONA_KIOSK_KEY_ALIAS=…
RONA_KIOSK_KEY_PASSWORD=…
```

Then run `pnpm build:apk` (assembleProdRelease). Without them, release builds fall back to the debug key, which is fine locally but not for terminals.
