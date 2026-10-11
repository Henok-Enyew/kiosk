/**
 * Kiosk constants. Mirrors `@rona/config/kiosk` and `@rona/config/hr` in the
 * rona-erp monorepo — keep both in sync when the server contract changes.
 */

export const ATTENDANCE_EVENT_TYPES = [
  'CLOCK_IN',
  'BREAK_START',
  'BREAK_END',
  'CLOCK_OUT',
] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export const VERIFICATION_POLICIES = [
  'FACE_ONLY',
  'FACE_OR_FINGER',
  'FACE_AND_FINGER',
  'CARD_AND_FACE',
  'CARD_AND_FINGER',
] as const;
export type VerificationPolicy = (typeof VERIFICATION_POLICIES)[number];

export const VERIFICATION_METHODS = [
  'FACE',
  'FINGER',
  'CARD',
  'PASSCODE',
] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

export type TemplateKind = 'FACE' | 'FINGER';

export const SIM_ALGORITHM_VERSION = 'sim-1';

export const HEADERS = {
  signature: 'x-kiosk-signature',
  timestamp: 'x-kiosk-timestamp',
  kioskId: 'x-kiosk-id',
  enrollToken: 'x-kiosk-enroll-token',
} as const;

export const ENROLL_CODE_LENGTH = 6;
export const ADMIN_PIN_LENGTH = 6;
export const PUNCH_BATCH_MAX = 100;
export const OFFLINE_MAX_AGE_HOURS = 72;

/** Client-side timings (ms). */
export const TIMING = {
  requestTimeout: 15_000,
  // Renew the 12 h session when less than this is left.
  sessionRenewMargin: 60 * 60_000,
  rosterSync: 5 * 60_000,
  heartbeat: 60_000,
  queueRetryMin: 15_000,
  queueRetryMax: 5 * 60_000,
  identifyTimeout: 20_000,
  secondFactorTimeout: 15_000,
  chooseActionTimeout: 12_000,
  resultDisplay: 4_000,
  errorDisplay: 5_000,
  supervisorIdle: 120_000,
  // Taps on the hidden corner that open the staff menu.
  staffMenuTaps: 5,
} as const;
