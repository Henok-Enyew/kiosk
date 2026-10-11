/**
 * Native kiosk API contract. Mirrors `@rona/types/kiosk` (rona-erp monorepo,
 * packages/types/src/kiosk) and the routes in packages/routes/src/workspace/api.ts.
 */
import type {
  AttendanceEventType,
  TemplateKind,
  VerificationMethod,
  VerificationPolicy,
} from '../config';

export const ROUTES = {
  register: '/api/kiosk/device/register',
  session: '/api/kiosk/device/session',
  roster: '/api/kiosk/device/roster',
  templates: '/api/kiosk/device/templates',
  template: (id: string) => `/api/kiosk/device/templates/${id}`,
  cards: '/api/kiosk/device/cards',
  employeeStatus: (employeeId: string) =>
    `/api/kiosk/device/employees/${employeeId}/status`,
  punch: '/api/kiosk/device/punch',
  punchBatch: '/api/kiosk/device/punch/batch',
  enrollAuthorize: '/api/kiosk/device/enroll/authorize',
  heartbeat: '/api/kiosk/device/heartbeat',
  adminPin: '/api/kiosk/device/admin/verify-pin',
} as const;

export interface ApiEnvelope<T> {
  success: boolean;
  statusCode?: number;
  message?: string;
  data?: T;
  errors?: Record<string, string[] | undefined>;
}

export type Engine = 'SIM' | 'ZKTECO';
export type Capability =
  | 'FACE'
  | 'FINGER'
  | 'CARD'
  | 'RELAY'
  | 'LED'
  | 'BUZZER';

export interface DeviceRegisterInput {
  deviceToken: string;
  publicKey: string;
  attestationChain: string[];
  device: {
    manufacturer: string;
    model: string;
    serial?: string;
    androidVersion: string;
    sdkInt: number;
    appVersion: string;
    engine: Engine;
    capabilities: Capability[];
  };
}

export interface DeviceSession {
  sessionToken: string;
  expiresAt: string;
  kiosk: {
    id: string;
    deviceId: string;
    name: string;
    verificationPolicy: VerificationPolicy;
    hasAdminPin: boolean;
  };
  organization: {
    id: string;
    name: string;
    logoUrl: string | null;
  };
}

export interface RosterEntry {
  employeeId: string;
  eid: string;
  fullName: string;
  active: boolean;
  updatedAt: string;
}

export interface RosterResult {
  serverTime: string;
  employees: RosterEntry[];
}

export interface TemplateEntry {
  id: string;
  employeeId: string;
  kind: TemplateKind;
  fingerIndex: number | null;
  algorithmVersion: string;
  template: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface TemplateSyncResult {
  serverTime: string;
  templates: TemplateEntry[];
}

export interface CardEntry {
  id: string;
  employeeId: string;
  uidHash: string;
  revokedAt: string | null;
}

export interface CardSyncResult {
  serverTime: string;
  cards: CardEntry[];
}

export interface EmployeeStatus {
  employeeId: string;
  employeeName: string;
  currentState: AttendanceEventType | 'none';
  allowedNextEvents: AttendanceEventType[];
  lastEventAt: string | null;
}

export interface PunchInput {
  clientEventId: string;
  employeeId: string;
  eventType: AttendanceEventType;
  methods: VerificationMethod[];
  matchScore?: number;
  cardId?: string;
  deviceEventAt: string;
}

export interface PunchResult {
  eventId: string;
  clientEventId: string;
  employeeId: string;
  employeeName: string;
  eventType: AttendanceEventType;
  eventAt: string;
  duplicate: boolean;
}

export type PunchBatchItem =
  | {
      clientEventId: string;
      status: 'RECORDED' | 'DUPLICATE';
      result: PunchResult;
    }
  | {
      clientEventId: string;
      status: 'REJECTED';
      error: { statusCode: number; message: string };
    };

export interface PunchBatchResult {
  results: PunchBatchItem[];
}

export interface EnrollAuthorizeResult {
  enrollToken: string;
  expiresAt: string;
  supervisorName: string;
}

export interface TemplateEnrollInput {
  employeeId: string;
  kind: TemplateKind;
  fingerIndex?: number;
  algorithmVersion: string;
  template: string;
  consentAt: string;
}

export type HardwareState =
  | 'READY'
  | 'UNAVAILABLE'
  | 'LICENSE_MISSING'
  | 'ERROR';

export interface HeartbeatInput {
  appVersion: string;
  engine: Engine;
  batteryLevel?: number;
  charging?: boolean;
  queueLength: number;
  templateCount: number;
  hardware: {
    face: HardwareState;
    finger: HardwareState;
    card: Exclude<HardwareState, 'LICENSE_MISSING'>;
  };
  lastError?: string;
}

export interface HeartbeatResult {
  serverTime: string;
  verificationPolicy: VerificationPolicy;
  hasAdminPin: boolean;
}
