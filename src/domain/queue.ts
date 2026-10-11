import { OFFLINE_MAX_AGE_HOURS, PUNCH_BATCH_MAX } from '../config';
import type { PunchBatchItem, PunchInput } from '../api/contract';

export interface QueuedPunch {
  input: PunchInput;
  employeeName: string;
  attempts: number;
  lastError?: string;
}

export interface QueueOutcome {
  remaining: QueuedPunch[];
  recorded: QueuedPunch[];
  rejected: (QueuedPunch & { reason: string })[];
}

export function enqueue(queue: readonly QueuedPunch[], item: QueuedPunch) {
  if (queue.some(q => q.input.clientEventId === item.input.clientEventId)) {
    return [...queue];
  }
  return [...queue, item];
}

/** Oldest first, never more than the server accepts in one batch. */
export function nextBatch(queue: readonly QueuedPunch[]): QueuedPunch[] {
  return [...queue]
    .sort((a, b) => a.input.deviceEventAt.localeCompare(b.input.deviceEventAt))
    .slice(0, PUNCH_BATCH_MAX);
}

export function isExpired(item: QueuedPunch, now = Date.now()) {
  const age = now - Date.parse(item.input.deviceEventAt);
  return age > OFFLINE_MAX_AGE_HOURS * 60 * 60 * 1000;
}

/** Applies a batch response: recorded/duplicate leave the queue, rejected are dropped and reported. */
export function applyBatchResult(
  queue: readonly QueuedPunch[],
  sent: readonly QueuedPunch[],
  results: readonly PunchBatchItem[],
): QueueOutcome {
  const byId = new Map(results.map(r => [r.clientEventId, r]));
  const recorded: QueuedPunch[] = [];
  const rejected: (QueuedPunch & { reason: string })[] = [];
  const done = new Set<string>();

  for (const item of sent) {
    const result = byId.get(item.input.clientEventId);
    if (!result) continue;
    done.add(item.input.clientEventId);
    if (result.status === 'REJECTED') {
      rejected.push({ ...item, reason: result.error.message });
    } else {
      recorded.push(item);
    }
  }

  const remaining = queue
    .filter(item => !done.has(item.input.clientEventId))
    .map(item =>
      sent.includes(item) ? { ...item, attempts: item.attempts + 1 } : item,
    );
  return { remaining, recorded, rejected };
}
