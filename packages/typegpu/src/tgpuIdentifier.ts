import type { ResolutionCtx, TgpuNamable, TgpuResolvable } from './types';

/**
 * Helpful when creating new Resolvable types. For internal use.
 */
export class TgpuIdentifier implements TgpuResolvable, TgpuNamable {
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
