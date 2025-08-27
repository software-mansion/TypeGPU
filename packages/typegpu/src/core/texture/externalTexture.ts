import {
  $gpuValueOf,
  $internal,
  $repr,
  $runtimeResource,
} from '../../shared/symbols.ts';
import { getName, setName } from '../../shared/meta.ts';
import { $wgslDataType } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { WgslExternalTexture } from '../../data/texture.ts';
import { valueProxyHandler } from '../valueProxyUtils.ts';
import { inCodegenMode } from '../../execMode.ts';

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
  implements TgpuExternalTexture, SelfResolvable {
  readonly [$runtimeResource] = true;
  readonly [$wgslDataType] = {} as WgslExternalTexture;
  readonly [$repr] = undefined as unknown as WgslExternalTexture;
  readonly resourceType = 'external-texture';
  readonly [$internal] = true;

  constructor(
    public readonly schema: WgslExternalTexture,
    private readonly _membership: LayoutMembership,
  ) {
    setName(this, _membership.key);
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: ${
        ctx.resolve(this.schema)
      };`,
    );

    return id;
  }

  [$gpuValueOf](): WgslExternalTexture {
    return new Proxy(
      {
        [$internal]: true,
        [$runtimeResource]: true,
        [$wgslDataType]: this.schema,
        '~resolve': (ctx: ResolutionCtx) => ctx.resolve(this),
        toString: () => `.value:${getName(this) ?? '<unnamed>'}`,
      },
      valueProxyHandler,
    ) as unknown as WgslExternalTexture;
  }

  get $(): WgslExternalTexture {
    if (inCodegenMode()) {
      return this[$gpuValueOf]();
    }

    throw new Error(
      'Direct access to texture views values is possible only as part of a compute dispatch or draw call. Try .read() or .write() instead',
    );
  }

  get value(): WgslExternalTexture {
    return this.$;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}
