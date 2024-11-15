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

/**
 * TODO: Remove after the builtin refactor
 */
class TgpuIdentifierImpl implements TgpuResolvable, TgpuNamable {
  label?: string | undefined;

  $name(label: string | undefined) {
    this.label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    return ctx.names.makeUnique(this.label);
  }

  toString(): string {
    return `id:${this.label ?? '<unnamed>'}`;
  }
}
