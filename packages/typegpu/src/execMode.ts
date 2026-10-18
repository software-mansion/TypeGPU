import { SlotScope } from './core/slot/slotScope.ts';
import { $internal } from './shared/symbols.ts';
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
  if (resolutionCtx === ctx) {
    return callback();
  }

  const prevCtx = resolutionCtx;
  resolutionCtx = ctx;
  try {
    return callback();
  } finally {
    resolutionCtx = prevCtx;
  }
}

export function getResolutionCtx(): ResolutionCtx | undefined {
  return resolutionCtx;
}

/**
 * Used to track slot bindings and instances of lazy values when executing
 * TypeGPU functions on the CPU, outside of any resolution. It only lives
 * for the duration of the outermost CPU call (see `provideSlotScope`), so that
 * lazy values are computed at most once per call, without being retained afterwards.
 */
let cpuSlotScope: SlotScope | undefined;

/**
 * The scope of the CPU call currently being executed outside of any resolution, if any.
 */
export function getCpuSlotScope(): SlotScope | undefined {
  return cpuSlotScope;
}

/**
 * Runs the callback with a scope that slot bindings can be read from and pushed onto.
 * If we're in the middle of a resolution (e.g. during lazy computation or a simulation),
 * that's the resolution's scope, otherwise it's a scope dedicated to the current CPU call,
 * created if we're not already inside one.
 */
export function provideSlotScope<T>(callback: (scope: SlotScope) => T): T {
  const scope = resolutionCtx?.[$internal].slotScope ?? cpuSlotScope;
  if (scope) {
    return callback(scope);
  }

  cpuSlotScope = new SlotScope({ lazyInstances: new WeakMap() });
  try {
    return callback(cpuSlotScope);
  } finally {
    cpuSlotScope = undefined;
  }
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
