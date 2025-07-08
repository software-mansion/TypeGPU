import { invariant } from './errors.ts';
import type { ExecutionCtx } from './executionCtx.ts';
import type { ResolutionCtx } from './types.ts';

let resolutionCtx: ResolutionCtx | null = null;

const CodegenMode = Symbol('CODEGEN');
const ComptimeMode = Symbol('COMPTIME');
const SimulateMode = Symbol('SIMULATE');

export const RuntimeMode = {
  CODEGEN: CodegenMode,
  COMPTIME: ComptimeMode,
  SIMULATE: SimulateMode,
} as const;

type ExecutionMode = typeof CodegenMode | typeof ComptimeMode | typeof SimulateMode;

const resolutionModeStack: ExecutionMode[] = [];

// Add execution contexts for COMPTIME and SIMULATE modes alongside existing ResolutionCtx
let comptimeExecutionCtx: ExecutionCtx | null = null;
let simulateExecutionCtx: ExecutionCtx | null = null;

export function provideCtx<T>(ctx: ResolutionCtx, callback: () => T): T {
  invariant(resolutionCtx === null, 'Cannot nest context providers');

  resolutionCtx = ctx;
  try {
    return callback();
  } finally {
    resolutionCtx = null;
  }
}

export function getResolutionCtx(): ResolutionCtx | null {
  return resolutionCtx;
}

export function pushMode(mode: ExecutionMode) {
  resolutionModeStack.push(mode);
}

export function popMode(expected?: ExecutionMode) {
  const mode = resolutionModeStack.pop();
  if (expected !== undefined) {
    invariant(mode === expected, 'Unexpected mode');
  }
}

export function getCurrentMode(): ExecutionMode | null {
  return resolutionModeStack.length > 0 
    ? resolutionModeStack[resolutionModeStack.length - 1] ?? null
    : null;
}

export function getExecutionCtx(): ExecutionCtx | null {
  const currentMode = getCurrentMode();
  if (currentMode === RuntimeMode.CODEGEN) {
    return getResolutionCtx(); // ResolutionCtxImpl implements ExecutionCtx (via ResolutionCtx)
  } else if (currentMode === RuntimeMode.COMPTIME) {
    return comptimeExecutionCtx; // ExecutionCtxImpl
  } else if (currentMode === RuntimeMode.SIMULATE) {
    return simulateExecutionCtx; // ExecutionCtxImpl
  }
  return null;
}

export function provideComptimeCtx<T>(ctx: ExecutionCtx, callback: () => T): T {
  const prev = comptimeExecutionCtx;
  comptimeExecutionCtx = ctx;
  try {
    return callback();
  } finally {
    comptimeExecutionCtx = prev;
  }
}

export function provideSimulateCtx<T>(ctx: ExecutionCtx, callback: () => T): T {
  const prev = simulateExecutionCtx;
  simulateExecutionCtx = ctx;
  try {
    return callback();
  } finally {
    simulateExecutionCtx = prev;
  }
}

export const inCodegenMode = () => getCurrentMode() === RuntimeMode.CODEGEN;
export const inComptimeMode = () => getCurrentMode() === RuntimeMode.COMPTIME;
export const inSimulateMode = () => getCurrentMode() === RuntimeMode.SIMULATE;

// Legacy compatibility
export const inGPUMode = () => inCodegenMode();
