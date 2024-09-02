import type { ResolutionCtx, WgslNamable, WgslResolvable } from './types';

/**
 * Helpful when creating new Resolvable types. For internal use.
 */
export class WgslIdentifier implements WgslResolvable, WgslNamable {
  label?: string | undefined;

  $name(label: string | undefined) {
    this.label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.nameFor(this);
  }

  toString(): string {
    return `id:${this.label ?? '<unnamed>'}`;
  }
}
