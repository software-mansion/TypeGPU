import { invariant } from './errors';
import type { ResolutionCtx } from './types';

let resolutionCtx: ResolutionCtx | null = null;

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

export const inGPUMode = () => resolutionCtx !== null;
