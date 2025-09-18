import { $internal, $ownSnippet, $resolve } from '../../shared/symbols.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type {
  ResolutionCtx,
  SelfResolvable,
  WithOwnSnippet,
} from '../../types.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';

// ----------
// Public API
// ----------

export interface TgpuExternalTexture {
  readonly resourceType: 'external-texture';
}

export function isExternalTexture<T extends TgpuExternalTexture>(
  value: unknown | T,
): value is T {
  return (value as T)?.resourceType === 'external-texture';
}

// --------------
// Implementation
// --------------

export class TgpuExternalTextureImpl
  implements TgpuExternalTexture, SelfResolvable, WithOwnSnippet {
  public readonly resourceType = 'external-texture';
  readonly [$internal] = true;

  constructor(private readonly _membership: LayoutMembership) {
    setName(this, _membership.key);
  }

  // TODO: do not treat self-resolvable as wgsl data (when we have proper texture schemas)
  // biome-ignore lint/suspicious/noExplicitAny: This is necessary until we have texture schemas
  [$ownSnippet] = snip(this, this as any);

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: texture_external;`,
    );

    // TODO: do not treat self-resolvable as wgsl data (when we have proper texture schemas)
    // biome-ignore lint/suspicious/noExplicitAny: This is necessary until we have texture schemas
    return snip(id, this as any);
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}
