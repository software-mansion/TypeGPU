import { invariant } from './errors.ts';
import { type ExecState, NormalState, type ResolutionCtx } from './types.ts';

/**
 * Used to track if the code we're currently
 * executing is inside an executing TypeGPU function.
 *
 * Helpful for providing better error messages.
 */
let insideTgpuFn = false;

export function provideInsideTgpuFn<T>(callback: () => T): T {
  if (insideTgpuFn) {
    return callback();
  }
  try {
    insideTgpuFn = true;
    return callback();
  } finally {
    insideTgpuFn = false;
  }
}

export function isInsideTgpuFn(): boolean {
  return insideTgpuFn;
}

let resolutionCtx: ResolutionCtx | undefined;

/**
 * Used to mock the context before all tests. For normal use-cases, use `provideCtx`
 */
export function INTERNAL_setCtx(ctx: ResolutionCtx | undefined) {
  resolutionCtx = ctx;
}

export function provideCtx<T>(ctx: ResolutionCtx, callback: () => T): T {
  invariant(resolutionCtx === undefined || resolutionCtx === ctx, 'Cannot nest context providers');

  if (resolutionCtx === ctx) {
    return callback();
  }

  resolutionCtx = ctx;
  try {
    return callback();
  } finally {
    resolutionCtx = undefined;
  }
}

export function getResolutionCtx(): ResolutionCtx | undefined {
  return resolutionCtx;
}

/**
 * Applicable when code is being executed outside of any
 * execution-altering APIs.
 */
export const topLevelState = new NormalState();

export function getExecMode(): ExecState {
  return resolutionCtx?.mode ?? topLevelState;
}

export function inCodegenMode() {
  return resolutionCtx?.mode.type === 'codegen';
}

// You can add getters for more modes if necessary...
