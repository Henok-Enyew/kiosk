import { ATTENDANCE_EVENT_TYPES, type AttendanceEventType } from '../config';

export type AttendanceState = AttendanceEventType | 'none';

/** Mirrors ATTENDANCE_TRANSITIONS in apps/server/.../hr/attendance.service.ts */
const TRANSITIONS: Record<AttendanceState, readonly AttendanceEventType[]> = {
  none: ['CLOCK_IN'],
  CLOCK_IN: ['BREAK_START', 'CLOCK_OUT'],
  BREAK_START: ['BREAK_END'],
  BREAK_END: ['BREAK_START', 'CLOCK_OUT'],
  CLOCK_OUT: ['CLOCK_IN'],
};

export function allowedNextEvents(
  state: AttendanceState | undefined,
): AttendanceEventType[] {
  // Unknown state (offline, never seen this employee): offer everything and let
  // the server validate the sequence when the punch syncs.
  if (state === undefined) return [...ATTENDANCE_EVENT_TYPES];
  return [...TRANSITIONS[state]];
}

/** The action most people want next, pre-selected on the action screen. */
export function suggestedEvent(
  allowed: readonly AttendanceEventType[],
): AttendanceEventType | null {
  if (allowed.length === 1) return allowed[0];
  if (allowed.includes('BREAK_END')) return 'BREAK_END';
  return null;
}
