import { invariant } from './errors.ts';
import type { ExecState, ResolutionCtx, SimulationState } from './types.ts';

let resolutionCtx: ResolutionCtx | undefined;

export function provideCtx<T>(ctx: ResolutionCtx, callback: () => T): T {
  invariant(
    resolutionCtx === undefined || resolutionCtx === ctx,
    'Cannot nest context providers',
  );

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

export function getExecMode(): ExecState | undefined {
  return resolutionCtx?.mode;
}

export function getSimulationState(): SimulationState | undefined {
  const mode = resolutionCtx?.mode;
  if (mode?.type === 'simulate') {
    return mode;
  }
  return undefined;
}

export function inCodegenMode() {
  return resolutionCtx?.mode?.type === 'codegen';
}

// You can add getters for more modes if necessary...
