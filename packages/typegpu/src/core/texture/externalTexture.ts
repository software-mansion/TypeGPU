import type { AnyData } from '../../data/dataTypes.ts';
import { $internal } from '../../shared/symbols.ts';
import { getName, setName } from '../../shared/meta.ts';
import { $wgslDataType } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';

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
  public readonly resourceType = 'external-texture';
  public readonly [$wgslDataType]: AnyData;
  readonly [$internal] = true;

  constructor(private readonly _membership: LayoutMembership) {
    setName(this, _membership.key);
    // TODO: do not treat self-resolvable as wgsl data (when we have proper texture schemas)
    // biome-ignore lint/suspicious/noExplicitAny: This is necessary until we have texture schemas
    this[$wgslDataType] = this as any;
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.getUniqueName(this);
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: texture_external;`,
    );

    return id;
  }

  toString() {
    return `${this.resourceType}:${getName(this) ?? '<unnamed>'}`;
  }
}
