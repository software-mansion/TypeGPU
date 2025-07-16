import { getResolutionCtx, provideCtx } from '../../execMode.ts';
import { StrictNameRegistry } from '../../nameRegistry.ts';
import { ResolutionCtxImpl } from '../../resolutionCtx.ts';
import { SimulationState } from '../../types.ts';

export function simulate<T>(callback: () => T): T {
  // We could already be inside a resolution context, for example
  // during "comptime", where users would like to precompute something
  // that happens to require simulation.
  const ctx = getResolutionCtx() ?? new ResolutionCtxImpl({
    // Not relevant
    names: new StrictNameRegistry(),
  });

  ctx.pushMode(new SimulationState());
  try {
    return provideCtx(ctx, callback);
  } finally {
    ctx.popMode('simulate');
  }
}
