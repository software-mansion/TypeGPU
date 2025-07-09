import { invariant } from './errors.ts';
import type { ResolutionCtx } from './types.ts';

let resolutionCtx: ResolutionCtx | null = null;

const CPUMode = 0;
const GPUMode = 1;

export const ExecMode = {
  COMPTIME: CPUMode,
  CODEGEN: GPUMode,
} as const;

const resolutionModeStack: (typeof CPUMode | typeof GPUMode)[] = [];

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

export function pushMode(mode: typeof CPUMode | typeof GPUMode) {
  resolutionModeStack.push(mode);
}

export function popMode(expected?: typeof CPUMode | typeof GPUMode) {
  const mode = resolutionModeStack.pop();
  if (expected !== undefined) {
    invariant(mode === expected, 'Unexpected mode');
  }
}

export const inCodegenMode = () =>
  resolutionModeStack.length > 0 &&
  resolutionModeStack[resolutionModeStack.length - 1] === ExecMode.CODEGEN;

export const inComptimeMode = () =>
  resolutionModeStack.length > 0 &&
  resolutionModeStack[resolutionModeStack.length - 1] === ExecMode.COMPTIME;
