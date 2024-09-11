import type { TgpuNamable } from './namable';
import type { ResolutionCtx, TgpuResolvable } from './types';

// ----------
// Public API
// ----------

/**
 * Helpful when creating new Resolvable types. For internal use.
 */
export function identifier() {
  return new TgpuIdentifierImpl();
}

// --------------
// Implementation
// --------------

class TgpuIdentifierImpl implements TgpuResolvable, TgpuNamable {
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
