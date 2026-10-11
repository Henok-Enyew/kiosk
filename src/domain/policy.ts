import type { VerificationMethod, VerificationPolicy } from '../config';

export type Factor = 'FACE' | 'FINGER' | 'CARD';

export interface VerificationPlan {
  /** Factors that can start a punch; any one of them identifies the employee. */
  identify: Factor[];
  /** Factor that must then confirm the same employee (1:1), if any. */
  confirm: Factor | null;
}

const PLANS: Record<VerificationPolicy, VerificationPlan> = {
  FACE_ONLY: { identify: ['FACE'], confirm: null },
  FACE_OR_FINGER: { identify: ['FACE', 'FINGER'], confirm: null },
  FACE_AND_FINGER: { identify: ['FACE'], confirm: 'FINGER' },
  CARD_AND_FACE: { identify: ['CARD'], confirm: 'FACE' },
  CARD_AND_FINGER: { identify: ['CARD'], confirm: 'FINGER' },
};

export function planFor(
  policy: VerificationPolicy,
  available: Record<Factor, boolean>,
): VerificationPlan & { missing: Factor[] } {
  const plan = PLANS[policy];
  const identify = plan.identify.filter(factor => available[factor]);
  const missing: Factor[] = [];
  if (identify.length === 0) missing.push(...plan.identify);
  if (plan.confirm && !available[plan.confirm]) missing.push(plan.confirm);
  return { identify, confirm: plan.confirm, missing };
}

/**
 * Same rule the server enforces (apps/server kiosk policy): a card alone is never
 * enough and a passcode never satisfies a native terminal policy.
 */
export function satisfiesPolicy(
  policy: VerificationPolicy,
  methods: readonly VerificationMethod[],
): boolean {
  const has = (method: VerificationMethod) => methods.includes(method);
  switch (policy) {
    case 'FACE_ONLY':
      return has('FACE');
    case 'FACE_OR_FINGER':
      return has('FACE') || has('FINGER');
    case 'FACE_AND_FINGER':
      return has('FACE') && has('FINGER');
    case 'CARD_AND_FACE':
      return has('CARD') && has('FACE');
    case 'CARD_AND_FINGER':
      return has('CARD') && has('FINGER');
  }
}
