import type { TemplateKind } from '../../config';
import { decodeBase64, encodeBase64 } from '../../util/base64';
import type { IdentifyOutcome, StoredTemplate } from '../types';

/**
 * Drives the simulated engines from the developer panel: a pending identify request
 * waits until the developer picks an outcome ("match Abebe", "no match", ...).
 */

export interface SimRequest {
  id: number;
  kind: TemplateKind;
  candidateEmployeeId?: string;
}

export interface SimSnapshot {
  pending: SimRequest[];
  enrolled: Record<TemplateKind, string[]>;
  failNextEnroll: boolean;
}

interface Waiter {
  request: SimRequest;
  resolve: (outcome: IdentifyOutcome) => void;
}

interface SimTemplatePayload {
  sim: 1;
  employeeId: string;
  kind: TemplateKind;
  fingerIndex: number | null;
  nonce: string;
}

export function encodeSimTemplate(
  payload: Omit<SimTemplatePayload, 'sim' | 'nonce'>,
) {
  const body: SimTemplatePayload = {
    sim: 1,
    ...payload,
    nonce: Math.random().toString(36).slice(2),
  };
  return encodeBase64(JSON.stringify(body));
}

export function decodeSimTemplate(template: string): SimTemplatePayload | null {
  try {
    const parsed = JSON.parse(decodeBase64(template)) as SimTemplatePayload;
    return parsed.sim === 1 ? parsed : null;
  } catch {
    return null;
  }
}

class SimController {
  private waiters: Waiter[] = [];
  private enrolled: Record<TemplateKind, Set<string>> = {
    FACE: new Set(),
    FINGER: new Set(),
  };
  private failNextEnroll = false;
  private nextId = 1;
  private listeners = new Set<() => void>();
  private snapshot: SimSnapshot = this.buildSnapshot();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  loadTemplates(kind: TemplateKind, templates: StoredTemplate[]) {
    const employees = new Set<string>();
    for (const entry of templates) {
      const payload = decodeSimTemplate(entry.template);
      if (payload?.kind === kind) employees.add(entry.employeeId);
    }
    this.enrolled[kind] = employees;
    this.emit();
  }

  isEnrolled(kind: TemplateKind, employeeId: string) {
    return this.enrolled[kind].has(employeeId);
  }

  /** Waits for the developer to choose an outcome in the panel. */
  request(
    kind: TemplateKind,
    candidateEmployeeId: string | undefined,
    signal: AbortSignal,
  ): Promise<IdentifyOutcome> {
    if (signal.aborted) return Promise.resolve({ type: 'cancelled' });
    return new Promise(resolve => {
      const request: SimRequest = {
        id: this.nextId++,
        kind,
        candidateEmployeeId,
      };
      const waiter: Waiter = { request, resolve };
      this.waiters = [
        ...this.waiters.filter(w => w.request.kind !== kind),
        waiter,
      ];
      signal.addEventListener('abort', () =>
        this.settle(request.id, { type: 'cancelled' }),
      );
      this.emit();
    });
  }

  /** Called by the developer panel. */
  respond(requestId: number, outcome: IdentifyOutcome) {
    const waiter = this.waiters.find(w => w.request.id === requestId);
    if (!waiter) return;
    if (
      outcome.type === 'match' &&
      !this.enrolled[waiter.request.kind].has(outcome.employeeId)
    ) {
      // A real matcher can only return enrolled people.
      this.settle(requestId, { type: 'no_match' });
      return;
    }
    this.settle(requestId, outcome);
  }

  setFailNextEnroll(value: boolean) {
    this.failNextEnroll = value;
    this.emit();
  }

  consumeFailNextEnroll() {
    const value = this.failNextEnroll;
    if (value) {
      this.failNextEnroll = false;
      this.emit();
    }
    return value;
  }

  private settle(requestId: number, outcome: IdentifyOutcome) {
    const waiter = this.waiters.find(w => w.request.id === requestId);
    if (!waiter) return;
    this.waiters = this.waiters.filter(w => w.request.id !== requestId);
    waiter.resolve(outcome);
    this.emit();
  }

  private buildSnapshot(): SimSnapshot {
    return {
      pending: this.waiters.map(w => w.request),
      enrolled: {
        FACE: [...this.enrolled.FACE],
        FINGER: [...this.enrolled.FINGER],
      },
      failNextEnroll: this.failNextEnroll,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    this.listeners.forEach(listener => listener());
  }
}

export const simController = new SimController();
