import React from 'react';
import { SIM_ALGORITHM_VERSION, type TemplateKind } from '../../config';
import type {
  BiometricEngine,
  EnrollOptions,
  EnrollOutcome,
  FaceEngine,
  FingerprintEngine,
  IdentifyOptions,
  StoredTemplate,
} from '../types';
import { strings } from '../../i18n/strings';
import { CameraPreview } from '../android/CameraPreview';
import { encodeSimTemplate, simController } from './simController';

const STEP_MS = 700;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<boolean>(resolve => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => resolve(true), ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function createSimEngine(kind: TemplateKind): BiometricEngine {
  return {
    kind,
    algorithmVersion: SIM_ALGORITHM_VERSION,
    status: async () => 'READY',
    loadTemplates: async (templates: StoredTemplate[]) => {
      simController.loadTemplates(kind, templates);
    },
    identify: ({ signal, candidateEmployeeId }: IdentifyOptions) =>
      simController.request(kind, candidateEmployeeId, signal),
    enroll: async ({
      employeeId,
      fingerIndex,
      signal,
      onProgress,
    }: EnrollOptions): Promise<EnrollOutcome> => {
      // Real fingerprint enrollment takes 3 presses; face takes one capture.
      const steps = kind === 'FINGER' ? 3 : 1;
      for (let step = 1; step <= steps; step++) {
        onProgress?.({
          step,
          of: steps,
          message:
            kind === 'FINGER'
              ? strings.dev.enrollFinger(step, steps)
              : strings.dev.enrollFace,
        });
        if (!(await wait(STEP_MS * 2, signal))) return { type: 'cancelled' };
      }
      if (simController.consumeFailNextEnroll()) {
        return { type: 'failed', message: strings.dev.enrollFailed };
      }
      return {
        type: 'enrolled',
        algorithmVersion: SIM_ALGORITHM_VERSION,
        quality: 90,
        template: encodeSimTemplate({
          employeeId,
          kind,
          fingerIndex: fingerIndex ?? null,
        }),
      };
    },
  };
}

export function createSimFaceEngine(): FaceEngine {
  return {
    ...createSimEngine('FACE'),
    kind: 'FACE',
    Preview: props => <CameraPreview {...props} />,
  };
}

export function createSimFingerprintEngine(): FingerprintEngine {
  return { ...createSimEngine('FINGER'), kind: 'FINGER' };
}
