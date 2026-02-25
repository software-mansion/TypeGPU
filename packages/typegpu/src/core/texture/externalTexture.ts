import { $gpuValueOf, $internal, $ownSnippet, $resolve } from '../../shared/symbols.ts';
import { getName, setName } from '../../shared/meta.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import { textureExternal, type WgslExternalTexture } from '../../data/texture.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import { inCodegenMode } from '../../execMode.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import { type ResolvedSnippet, snip } from '../../data/snippet.ts';
import type { Infer } from '../../shared/repr.ts';

// ----------
// Public API
// ----------

export interface TgpuExternalTexture {
  readonly resourceType: 'external-texture';
}

export function isExternalTexture(value: unknown): value is TgpuExternalTexture {
  return (value as TgpuExternalTexture)?.resourceType === 'external-texture';
}

// --------------
// Implementation
// --------------

export class TgpuExternalTextureImpl implements TgpuExternalTexture, SelfResolvable {
  readonly resourceType = 'external-texture';
  readonly [$internal] = true;
  readonly #membership: LayoutMembership;

  constructor(
    public readonly schema: WgslExternalTexture,
    membership: LayoutMembership,
  ) {
    this.#membership = membership;
    setName(this, membership.key);
  }

  [$resolve](ctx: ResolutionCtx): ResolvedSnippet {
    const id = ctx.getUniqueName(this);
    const group = ctx.allocateLayoutEntry(this.#membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this.#membership.idx}) var ${id}: ${
        ctx.resolve(this.schema).value
      };`,
    );

    return snip(id, textureExternal(), 'handle');
  }

  get [$gpuValueOf](): Infer<WgslExternalTexture> {
    const schema = this.schema;

    return new Proxy(
      {
        [$internal]: true,
        get [$ownSnippet]() {
          return snip(this, schema, 'handle');
        },
        [$resolve]: (ctx) => ctx.resolve(this),
        toString: () => `textureExternal:${getName(this) ?? '<unnamed>'}.$`,
      },
      valueProxyHandler,
    ) as unknown as Infer<WgslExternalTexture>;
  }

  get $(): Infer<WgslExternalTexture> {
    if (inCodegenMode()) {
      return this[$gpuValueOf];
    }

    throw new Error(
      'Direct access to texture views values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get value(): Infer<WgslExternalTexture> {
    return this.$;
  }

  toString() {
    return `textureExternal:${getName(this) ?? '<unnamed>'}`;
  }
}
