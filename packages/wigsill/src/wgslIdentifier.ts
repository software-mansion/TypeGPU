import type { ResolutionCtx, WgslResolvable } from './types';

/**
 * Helpful when creating new Resolvable types. For internal use.
 */
export class WgslIdentifier implements WgslResolvable {
  debugLabel?: string | undefined;

  alias(debugLabel: string) {
    this.debugLabel = debugLabel;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.nameFor(this);
  }
}
