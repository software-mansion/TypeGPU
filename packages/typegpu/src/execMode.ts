import { invariant } from './errors.ts';
import type { ResolutionCtx } from './types.ts';

let resolutionCtx: ResolutionCtx | null = null;

export const ExecMode = {
  COMPTIME: 0,
  CODEGEN: 1,
} as const;

const resolutionModeStack:
  (typeof ExecMode.COMPTIME | typeof ExecMode.CODEGEN)[] = [];

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

export function pushMode(
  mode: typeof ExecMode.COMPTIME | typeof ExecMode.CODEGEN,
) {
  resolutionModeStack.push(mode);
}

export function popMode(
  expected?: typeof ExecMode.COMPTIME | typeof ExecMode.CODEGEN,
) {
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
