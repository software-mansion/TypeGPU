import { invariant } from './errors';
import type { ResolutionCtx } from './types';

let resolutionCtx: ResolutionCtx | null = null;

const CPUMode = Symbol('CPU');
const GPUMode = Symbol('GPU');

export const RuntimeMode = {
  CPU: CPUMode,
  GPU: GPUMode,
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

export const inGPUMode = () =>
  resolutionModeStack.length > 0 &&
  resolutionModeStack[resolutionModeStack.length - 1] === RuntimeMode.GPU;
