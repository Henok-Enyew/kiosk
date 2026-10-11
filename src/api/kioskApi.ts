import type { KioskHttpClient } from './client';
import {
  ROUTES,
  type CardEntry,
  type CardSyncResult,
  type DeviceRegisterInput,
  type DeviceSession,
  type EmployeeStatus,
  type EnrollAuthorizeResult,
  type HeartbeatInput,
  type HeartbeatResult,
  type PunchBatchResult,
  type PunchInput,
  type PunchResult,
  type RosterResult,
  type TemplateEnrollInput,
  type TemplateEntry,
  type TemplateSyncResult,
} from './contract';

/** Typed calls for the native kiosk device API. */
export function createKioskApi(http: KioskHttpClient) {
  return {
    register: (input: DeviceRegisterInput) =>
      http.request<DeviceSession>('POST', ROUTES.register, {
        body: input,
        auth: 'none',
      }),

    renewSession: (kioskId: string) =>
      http.request<DeviceSession>('POST', ROUTES.session, {
        body: { kioskId },
        auth: 'signed',
      }),

    roster: (since?: string) =>
      http.request<RosterResult>('GET', ROUTES.roster, { query: { since } }),

    templates: (since?: string) =>
      http.request<TemplateSyncResult>('GET', ROUTES.templates, {
        query: { since },
      }),

    cards: (since?: string) =>
      http.request<CardSyncResult>('GET', ROUTES.cards, { query: { since } }),

    employeeStatus: (employeeId: string) =>
      http.request<EmployeeStatus>('GET', ROUTES.employeeStatus(employeeId)),

    punch: (input: PunchInput) =>
      http.request<PunchResult>('POST', ROUTES.punch, { body: input }),

    punchBatch: (events: PunchInput[]) =>
      http.request<PunchBatchResult>('POST', ROUTES.punchBatch, {
        body: { events },
      }),

    authorizeEnrollment: (code: string) =>
      http.request<EnrollAuthorizeResult>('POST', ROUTES.enrollAuthorize, {
        body: { code },
      }),

    enrollTemplate: (enrollToken: string, input: TemplateEnrollInput) =>
      http
        .request<{ template: TemplateEntry }>('POST', ROUTES.templates, {
          body: input,
          enrollToken,
        })
        .then(result => result.template),

    revokeTemplate: (enrollToken: string, templateId: string) =>
      http
        .request<{ template: TemplateEntry }>(
          'DELETE',
          ROUTES.template(templateId),
          { enrollToken },
        )
        .then(result => result.template),

    bindCard: (
      enrollToken: string,
      input: { employeeId: string; uid: string; label?: string },
    ) =>
      http
        .request<{ card: CardEntry }>('POST', ROUTES.cards, {
          body: input,
          enrollToken,
        })
        .then(result => result.card),

    heartbeat: (input: HeartbeatInput) =>
      http.request<HeartbeatResult>('POST', ROUTES.heartbeat, { body: input }),

    verifyAdminPin: (pin: string) =>
      http.request<{ valid: true }>('POST', ROUTES.adminPin, { body: { pin } }),
  };
}

export type KioskApi = ReturnType<typeof createKioskApi>;
