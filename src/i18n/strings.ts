import type { AttendanceEventType, VerificationPolicy } from '../config';

/**
 * All user-facing text. Kept in one place so an Amharic table can be added
 * without touching screens.
 */
export const strings = {
  appName: 'Rona Kiosk',
  tagline: 'Rona Workforce — secure attendance terminal',

  pairing: {
    title: 'Pair this terminal',
    subtitle:
      'Connect this terminal to your organization in Rona. You need a computer signed in to Rona as an administrator.',
    steps: [
      'On the computer, open Rona → Organization → Kiosks.',
      'Click “Register kiosk”. A QR code appears — it is shown only once, so keep it open.',
      'Tap “Scan QR code” below and point this camera at it.',
    ],
    scan: 'Scan QR code',
    scanHint:
      'Point the camera at the QR code in Rona → Organization → Kiosks → Register kiosk.',
    manual: 'Enter details manually',
    manualHint:
      'Use this when the camera cannot read the QR code. Both values are shown in Rona under the QR code.',
    apiUrl: 'Server address',
    apiUrlHint: 'e.g. https://api.rona.pro.et',
    apiUrlHelp:
      'The Rona server this terminal talks to — normally https://api.rona.pro.et.',
    token: 'Device credential',
    tokenHelp: 'The one-time credential shown with the QR code in Rona.',
    pair: 'Pair terminal',
    pairing: 'Pairing…',
    invalidQr: 'This QR code is not a Rona kiosk code.',
    back: 'Back',
    revoked:
      'This terminal was deactivated or unpaired in Rona. Pair it again to continue.',
    tried: (url: string) => `Server tried: ${url}`,
    notSupported:
      'This server doesn’t support Rona terminals yet (it answered “not found”). Check that this is the Rona API address; if it is, update or deploy the Rona server, then try again.',
    unreachable:
      'The server could not be reached. Check the address and this terminal’s internet connection. On mobile data, try Wi-Fi instead — some mobile networks block the Rona server.',
    loopback:
      'This address points at the terminal itself (localhost). It only works while the phone is connected over USB with “adb reverse tcp:8000 tcp:8000”. Use the public server address for normal use.',
    cleartextBlocked:
      'This build only connects to secure https:// addresses. Use the https address of your Rona server.',
    rejected: (message: string) => `Rona rejected the pairing: ${message}`,
    rejectedHint:
      'Register the kiosk again in Rona to get a new QR code — a credential works only once.',
    serverError:
      'The Rona server had a problem. Try again in a minute; if it keeps failing, contact your Rona administrator.',
  },

  idle: {
    lookAtCamera: 'Look at the camera',
    placeFinger: 'or place your finger on the sensor',
    tapCard: 'Tap your card to begin',
    faceOrFinger: 'Look at the camera or place your finger',
    lookAtCameraHint:
      'Stand about an arm’s length away and face the screen.',
    fingerHint: 'Press your finger flat on the sensor.',
    cardHint: 'Hold your card flat against the reader.',
    offline: 'Offline — punches are saved and will sync',
    queued: (count: number) => `${count} waiting to sync`,
    savedOffline: (count: number) =>
      `${count} ${
        count === 1 ? 'punch is' : 'punches are'
      } saved on this terminal and will upload when online.`,
    notReady: 'This terminal is not ready',
    notReadyHint:
      'Ask an administrator to check Terminal settings (tap the Rona logo at the top 5 times).',
    staffHint: 'Staff: tap the Rona logo 5×',
    devHint:
      'Developer build: tap DEV (bottom right) to simulate a face or fingerprint match.',
  },

  verify: {
    confirmWithFace: 'Now look at the camera',
    confirmWithFinger: 'Now place your finger on the sensor',
    hello: (name: string) => `Hello, ${name}`,
    scanning: 'Scanning…',
    cancel: 'Cancel',
  },

  action: {
    title: 'What would you like to do?',
    loading: 'Checking your status…',
    offlineHint: 'Offline — your punch will sync when the connection is back',
  },

  events: {
    CLOCK_IN: 'Clock in',
    CLOCK_OUT: 'Clock out',
    BREAK_START: 'Start break',
    BREAK_END: 'End break',
  } satisfies Record<AttendanceEventType, string>,

  eventsDone: {
    CLOCK_IN: 'Clocked in',
    CLOCK_OUT: 'Clocked out',
    BREAK_START: 'Break started',
    BREAK_END: 'Break ended',
  } satisfies Record<AttendanceEventType, string>,

  result: {
    savedOffline: (count: number) =>
      `Saved on this terminal — will upload when online (${count} waiting).`,
  },

  errors: {
    noMatch: 'We could not recognise you. Please try again.',
    livenessFailed:
      'Please use your real face — photos and screens are not accepted.',
    differentPerson: 'That does not match the card holder.',
    unknownCard: 'This card is not registered.',
    inactiveEmployee: 'Your profile is not active. Please contact HR.',
    unknownEmployee: 'You are not on this terminal yet. Please contact HR.',
    timeout: 'Time ran out. Please start again.',
    hardwareMissing: (what: string) =>
      `${what} is not available on this terminal.`,
    generic: 'Something went wrong. Please try again.',
    tooMany: 'Too many attempts. Please wait a moment.',
  },

  factors: {
    FACE: 'Face recognition',
    FINGER: 'Fingerprint',
    CARD: 'Card reader',
  },

  policies: {
    FACE_ONLY: 'Face',
    FACE_OR_FINGER: 'Face or fingerprint',
    FACE_AND_FINGER: 'Face and fingerprint',
    CARD_AND_FACE: 'Card and face',
    CARD_AND_FINGER: 'Card and fingerprint',
  } satisfies Record<VerificationPolicy, string>,

  staff: {
    title: 'Staff access',
    supervisor: 'Enroll employees',
    intro: 'For supervisors and administrators only.',
    supervisorHint:
      'Register faces, fingerprints and cards. Needs an enrollment code from Rona → Organization → Kiosks → Enrollment code.',
    admin: 'Terminal settings',
    adminHint: 'Sync, diagnostics, kiosk mode, unpair. Needs the admin PIN.',
    close: 'Close',
    back: 'Back',
    enterCode: 'Enter enrollment code',
    codeHelp:
      'Get a 6-digit code in Rona → Organization → Kiosks → Enrollment code. It expires after a few minutes.',
    enterPin: 'Enter admin PIN',
    pinHelp:
      'The admin PIN is set in Rona → Organization → Kiosks (edit this kiosk).',
    noPin:
      'No admin PIN is set for this kiosk. Set one in Rona → Organization → Kiosks.',
    online: 'This needs a connection to Rona.',
  },

  supervisor: {
    title: 'Enrollment',
    signedInAs: (name: string) => `Signed in as ${name}`,
    steps: [
      'Find the employee by name or employee ID.',
      'Enroll a face, fingerprints or a card. Read the consent text to the employee first.',
      'Tap Finish when done — new templates reach the organization’s other terminals at their next sync.',
    ],
    search: 'Search by name or employee ID',
    noEmployees:
      'No employees on this terminal yet. Check the connection, then use Terminal settings → Sync now.',
    noResults: 'No employee matches this search.',
    faceHelp:
      'Ask the employee to remove hats and sunglasses, face the camera from about an arm’s length and hold still.',
    fingerHelp:
      'Use a finger that is clean and dry. Place the same finger on the sensor each time it asks, pressing flat.',
    cardHelp: 'Each card works only for this employee.',
    face: 'Face',
    fingers: 'Fingerprints',
    cards: 'Cards',
    enrolled: 'Enrolled',
    notEnrolled: 'Not enrolled',
    enrollFace: 'Enroll face',
    reenrollFace: 'Re-enroll face',
    addFinger: 'Add fingerprint',
    addCard: 'Add card',
    revoke: 'Remove',
    consentTitle: 'Consent',
    consentHint: 'Read this to the employee and enroll only if they agree:',
    consentBody: (name: string) =>
      `${name}'s biometric template will be stored encrypted in Rona and on the organization's terminals, only to record attendance. It can be removed at any time by HR.`,
    consentAgree: 'Employee agrees',
    tapCardNow: 'Tap the card on the reader',
    saving: 'Saving to Rona…',
    chooseFinger: 'Choose a finger',
    done: 'Saved',
    exit: 'Finish',
    inactive: 'Inactive',
    serverFailed:
      'The server couldn’t save this. Nothing was enrolled — contact your Rona administrator (the server may be missing its template encryption key).',
    fingerCount: (count: number) =>
      `${count} ${count === 1 ? 'finger' : 'fingers'}`,
  },

  fingers: [
    'Right thumb',
    'Right index',
    'Right middle',
    'Right ring',
    'Right little',
    'Left thumb',
    'Left index',
    'Left middle',
    'Left ring',
    'Left little',
  ],

  admin: {
    title: 'Terminal settings',
    terminal: 'Terminal',
    connection: 'Connection',
    hardware: 'Hardware',
    sync: 'Sync',
    syncNow: 'Sync now',
    lastSync: 'Last sync',
    lastHeartbeat: 'Last heartbeat',
    queue: 'Offline queue',
    templates: 'Templates on device',
    employees: 'Employees',
    lastError: 'Last error',
    policy: 'Verification',
    kioskMode: 'Kiosk mode',
    enterKiosk: 'Lock to kiosk mode',
    exitKiosk: 'Exit kiosk mode',
    deviceOwner: 'Device owner',
    testSignals: 'Test LED / buzzer',
    testCard: 'Test card reader',
    unpair: 'Unpair terminal',
    unpairCancel: 'Keep paired',
    unpairConfirm:
      'Unpairing removes this terminal’s key and all synced data. Punches still waiting to sync will be lost.',
    close: 'Close',
    cardSeen: (uid: string) => `Card read: ${uid}`,
    kiosk: 'Kiosk',
    organization: 'Organization',
    device: 'Device',
    app: 'App',
    server: 'Server',
    status: 'Status',
    cards: 'Cards',
    templateCounts: (face: number, finger: number) =>
      `Face ${face} · Finger ${finger}`,
    syncHelp:
      'The terminal syncs every few minutes by itself. Offline punches upload as soon as the server is reachable.',
  },

  dev: {
    title: 'Simulated hardware',
    intro:
      'Developer build: this panel plays the camera and fingerprint sensor. When the terminal waits for a scan, pick what the “hardware” sees.',
    noScan:
      'No scan in progress. The terminal asks for one on the idle screen and during enrollment.',
    camera: 'Camera',
    sensor: 'Fingerprint sensor',
    verify: (name: string) => ` · verify ${name}`,
    identify: ' · identify',
    match: (name: string) => `✓ ${name}`,
    someoneElse: 'Someone else',
    noMatch: 'No match',
    spoof: 'Photo spoof',
    nobodyEnrolled:
      'Nobody is enrolled for this yet. Enroll someone via the staff menu (tap the Rona logo 5×).',
    failNextEnroll: 'Fail next enrollment',
    enrolled: (face: number, finger: number) =>
      `Enrolled — face: ${face}, finger: ${finger}.`,
    // Messages from the simulated engines during enrollment.
    enrollFace: 'Hold still and look at the camera',
    enrollFinger: (step: number, of: number) =>
      `Place the finger on the sensor (${step}/${of})`,
    enrollFailed: 'Low quality capture. Try again.',
    legend: [
      '✓ Name — recognise that employee.',
      'Someone else — a different enrolled person (second-factor mismatch).',
      'No match — nobody is recognised.',
      'Photo spoof — the liveness check fails.',
      'Fail next enrollment — the next enroll attempt reports a bad capture.',
    ],
  },

  camera: {
    permissionDenied: 'Camera access is needed. Allow it in Android settings.',
  },

  common: {
    yes: 'Yes',
    no: 'No',
    cancel: 'Cancel',
    confirm: 'Confirm',
    never: 'Never',
    online: 'Online',
    offline: 'Offline',
  },
} as const;
