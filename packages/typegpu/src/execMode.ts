import { invariant } from './errors.ts';
import type { ResolutionCtx } from './types.ts';

let resolutionCtx: ResolutionCtx | null = null;

export type ExecMode = 'comptime' | 'codegen';

const resolutionModeStack: ExecMode[] = [];

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

export function pushMode(mode: ExecMode) {
  resolutionModeStack.push(mode);
}

export function popMode(expected?: ExecMode) {
  const mode = resolutionModeStack.pop();
  if (expected !== undefined) {
    invariant(mode === expected, 'Unexpected mode');
  }
}

export const inCodegenMode = () =>
  resolutionModeStack.length > 0 &&
  resolutionModeStack[resolutionModeStack.length - 1] === 'codegen';

export const inComptimeMode = () =>
  resolutionModeStack.length > 0 &&
  resolutionModeStack[resolutionModeStack.length - 1] === 'comptime';
