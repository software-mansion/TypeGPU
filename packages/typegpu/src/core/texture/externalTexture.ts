import { getName, setName } from '../../shared/meta.ts';
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

  constructor(private readonly _membership: LayoutMembership) {
    setName(this, _membership.key);
  }

  '~resolve'(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(getName(this));
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
