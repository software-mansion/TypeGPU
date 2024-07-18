import type { ResolutionCtx, WgslResolvable } from './types';

/**
 * Helpful when creating new Resolvable types. For internal use.
 */
export class WgslIdentifier implements WgslResolvable {
  debugLabel?: string | undefined;

  $name(debugLabel: string | undefined) {
    this.debugLabel = debugLabel;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.nameFor(this);
  }
}
