import { ApiError } from '../api/client';
import type { CardEntry, EmployeeStatus, RosterEntry } from '../api/contract';
import {
  TIMING,
  type AttendanceEventType,
  type VerificationMethod,
  type VerificationPolicy,
} from '../config';
import { strings } from '../i18n/strings';
import type {
  BiometricEngine,
  Hardware,
  IdentifyOutcome,
} from '../hardware/types';
import { planFor, type Factor } from './policy';

export type FlowState =
  | { phase: 'idle'; identify: Factor[] }
  | { phase: 'unavailable'; missing: Factor[] }
  | {
      phase: 'confirm';
      employeeId: string;
      employeeName: string;
      factor: 'FACE' | 'FINGER';
    }
  | {
      phase: 'choose';
      employeeId: string;
      employeeName: string;
      methods: VerificationMethod[];
      status: EmployeeStatus | null;
      offline: boolean;
    }
  | {
      phase: 'submitting';
      employeeName: string;
      eventType: AttendanceEventType;
    }
  | {
      phase: 'success';
      employeeName: string;
      eventType: AttendanceEventType;
      eventAt: string;
      queued: boolean;
    }
  | { phase: 'error'; message: string };

export type PunchSubmitOutcome =
  | {
      status: 'recorded';
      result: {
        employeeName: string;
        eventType: AttendanceEventType;
        eventAt: string;
      };
    }
  | {
      status: 'queued';
      employeeName: string;
      eventType: AttendanceEventType;
      eventAt: string;
    };

export interface PunchFlowDeps {
  hardware: Pick<Hardware, 'face' | 'finger' | 'card' | 'io'>;
  policy(): VerificationPolicy;
  employee(employeeId: string): RosterEntry | undefined;
  cardByUid(uid: string): CardEntry | undefined;
  employeeStatus(
    employeeId: string,
  ): Promise<EmployeeStatus & { offline?: boolean }>;
  isOnline(): boolean;
  punch(request: {
    employeeId: string;
    eventType: AttendanceEventType;
    methods: VerificationMethod[];
    matchScore?: number;
    cardId?: string;
  }): Promise<PunchSubmitOutcome>;
}

interface Verified {
  employeeId: string;
  employeeName: string;
  methods: VerificationMethod[];
  score?: number;
  cardId?: string;
}

/**
 * The punch state machine: identify (1:N) → optional confirm (1:1) → choose action
 * → submit → result → back to idle. Framework-free so it can be unit-tested.
 */
export class PunchFlow {
  private state: FlowState = { phase: 'idle', identify: [] };
  private listeners = new Set<() => void>();
  private abort: AbortController | null = null;
  private stopCard: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private verified: Verified | null = null;
  private paused = false;
  private disposed = false;

  constructor(private readonly deps: PunchFlowDeps) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = () => this.state;

  start() {
    this.paused = false;
    this.toIdle();
  }

  /** Stops all hardware listeners (staff menu open, screen hidden). */
  pause() {
    this.paused = true;
    this.cleanup();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.toIdle();
  }

  dispose() {
    this.disposed = true;
    this.cleanup();
    this.listeners.clear();
  }

  cancel() {
    this.toIdle();
  }

  /** Restart identification, e.g. after the verification policy changed. */
  refresh() {
    if (this.state.phase === 'idle' || this.state.phase === 'unavailable')
      this.toIdle();
  }

  async select(eventType: AttendanceEventType) {
    const verified = this.verified;
    if (this.state.phase !== 'choose' || !verified) return;
    this.clearTimer();
    this.set({
      phase: 'submitting',
      employeeName: verified.employeeName,
      eventType,
    });
    try {
      const outcome = await this.deps.punch({
        employeeId: verified.employeeId,
        eventType,
        methods: verified.methods,
        matchScore: verified.score,
        cardId: verified.cardId,
      });
      if (this.disposed) return;
      const result =
        outcome.status === 'recorded'
          ? { ...outcome.result, queued: false }
          : { ...outcome, queued: true };
      this.deps.hardware.io.signal('success');
      this.set({
        phase: 'success',
        employeeName: result.employeeName || verified.employeeName,
        eventType: result.eventType,
        eventAt: result.eventAt,
        queued: result.queued,
      });
      this.after(TIMING.resultDisplay, () => this.toIdle());
    } catch (error) {
      this.fail(punchErrorMessage(error));
    }
  }

  // ---- phases ----------------------------------------------------------------------

  private toIdle() {
    this.cleanup();
    this.verified = null;
    const { face, finger, card } = this.deps.hardware;
    const plan = planFor(this.deps.policy(), {
      FACE: face != null,
      FINGER: finger != null,
      CARD: card != null,
    });
    if (plan.missing.length) {
      this.set({ phase: 'unavailable', missing: plan.missing });
      return;
    }
    this.set({ phase: 'idle', identify: plan.identify });
    if (this.paused || this.disposed) return;

    const abort = new AbortController();
    this.abort = abort;

    for (const factor of plan.identify) {
      if (factor === 'CARD') {
        this.stopCard = card!.listen(uid => this.onCard(uid));
        continue;
      }
      const engine = this.engineFor(factor)!;
      engine
        .identify({ signal: abort.signal })
        .then(outcome => {
          if (abort.signal.aborted) return;
          this.onIdentifyOutcome(outcome, factor, plan.confirm);
        })
        .catch(error => {
          if (!abort.signal.aborted) this.fail(errorMessage(error));
        });
    }
  }

  private onCard(uid: string) {
    if (this.state.phase !== 'idle') return;
    const card = this.deps.cardByUid(uid);
    if (!card) {
      this.fail(strings.errors.unknownCard);
      return;
    }
    const plan = planFor(this.deps.policy(), {
      FACE: true,
      FINGER: true,
      CARD: true,
    });
    this.onIdentified(
      card.employeeId,
      'CARD',
      undefined,
      plan.confirm,
      card.id,
    );
  }

  private onIdentifyOutcome(
    outcome: IdentifyOutcome,
    factor: 'FACE' | 'FINGER',
    confirm: Factor | null,
  ) {
    switch (outcome.type) {
      case 'match':
        this.onIdentified(outcome.employeeId, factor, outcome.score, confirm);
        return;
      case 'no_match':
        this.fail(strings.errors.noMatch);
        return;
      case 'liveness_failed':
        this.fail(strings.errors.livenessFailed);
        return;
      case 'error':
        this.fail(outcome.message);
        return;
      case 'cancelled':
        return;
    }
  }

  private onIdentified(
    employeeId: string,
    factor: Factor,
    score: number | undefined,
    confirm: Factor | null,
    cardId?: string,
  ) {
    this.cleanup();
    const employee = this.deps.employee(employeeId);
    if (!employee) {
      this.fail(strings.errors.unknownEmployee);
      return;
    }
    if (!employee.active) {
      this.fail(strings.errors.inactiveEmployee);
      return;
    }
    const verified: Verified = {
      employeeId,
      employeeName: employee.fullName,
      methods: [factor],
      score,
      cardId,
    };

    if (confirm && confirm !== factor && confirm !== 'CARD') {
      this.confirmWith(confirm, verified);
      return;
    }
    this.toChoose(verified);
  }

  private confirmWith(factor: 'FACE' | 'FINGER', verified: Verified) {
    const engine = this.engineFor(factor);
    if (!engine) {
      this.fail(strings.errors.hardwareMissing(strings.factors[factor]));
      return;
    }
    this.set({
      phase: 'confirm',
      employeeId: verified.employeeId,
      employeeName: verified.employeeName,
      factor,
    });
    const abort = new AbortController();
    this.abort = abort;
    this.after(TIMING.secondFactorTimeout, () => {
      abort.abort();
      this.fail(strings.errors.timeout);
    });
    engine
      .identify({
        signal: abort.signal,
        candidateEmployeeId: verified.employeeId,
      })
      .then(outcome => {
        if (abort.signal.aborted) return;
        this.clearTimer();
        if (outcome.type === 'match') {
          if (outcome.employeeId !== verified.employeeId) {
            this.fail(strings.errors.differentPerson);
            return;
          }
          this.toChoose({
            ...verified,
            methods: [...verified.methods, factor],
            score: Math.min(verified.score ?? outcome.score, outcome.score),
          });
          return;
        }
        if (outcome.type !== 'cancelled')
          this.onIdentifyOutcome(outcome, factor, null);
      })
      .catch(error => {
        if (!abort.signal.aborted) this.fail(errorMessage(error));
      });
  }

  private toChoose(verified: Verified) {
    this.cleanup();
    this.verified = verified;
    this.deps.hardware.io.signal('attention');
    const choose = {
      phase: 'choose' as const,
      employeeId: verified.employeeId,
      employeeName: verified.employeeName,
      methods: verified.methods,
      status: null,
      offline: !this.deps.isOnline(),
    };
    this.set(choose);
    this.after(TIMING.chooseActionTimeout, () => this.toIdle());

    this.deps
      .employeeStatus(verified.employeeId)
      .then(status => {
        const current = this.state;
        if (
          current.phase !== 'choose' ||
          current.employeeId !== verified.employeeId
        )
          return;
        this.set({ ...current, status, offline: !this.deps.isOnline() });
      })
      .catch(error => {
        if (this.state.phase === 'choose') this.fail(punchErrorMessage(error));
      });
  }

  private fail(message: string) {
    this.cleanup();
    this.verified = null;
    this.deps.hardware.io.signal('failure');
    this.set({ phase: 'error', message });
    this.after(TIMING.errorDisplay, () => this.toIdle());
  }

  // ---- helpers ---------------------------------------------------------------------

  private engineFor(factor: Factor): BiometricEngine | null {
    if (factor === 'FACE') return this.deps.hardware.face;
    if (factor === 'FINGER') return this.deps.hardware.finger;
    return null;
  }

  private after(ms: number, fn: () => void) {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) fn();
    }, ms);
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private cleanup() {
    this.clearTimer();
    this.abort?.abort();
    this.abort = null;
    this.stopCard?.();
    this.stopCard = null;
  }

  private set(state: FlowState) {
    if (this.disposed) return;
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : strings.errors.generic;
}

export function punchErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.statusCode === 429) return strings.errors.tooMany;
    if (error.statusCode === 403) return strings.errors.inactiveEmployee;
    if (error.statusCode === 404) return strings.errors.unknownEmployee;
    return error.message || strings.errors.generic;
  }
  return errorMessage(error);
}
