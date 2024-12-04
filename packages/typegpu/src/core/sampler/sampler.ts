// ----------
// Public API
// ----------

import type { LayoutMembership } from '../../tgpuBindGroupLayout';
import type { ResolutionCtx } from '../../types';

export interface TgpuSampler {
  readonly resourceType: 'sampler';
}

export interface TgpuComparisonSampler {
  readonly resourceType: 'sampler-comparison';
}

// --------------
// Implementation
// --------------

export class TgpuSamplerImpl implements TgpuSampler {
  public readonly resourceType = 'sampler';

  constructor(private readonly _membership: LayoutMembership) {}

  get label(): string | undefined {
    return this._membership.key;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: sampler;`,
    );

    return id;
  }
}

export class TgpuComparisonSamplerImpl implements TgpuComparisonSampler {
  public readonly resourceType = 'sampler-comparison';

  constructor(private readonly _membership: LayoutMembership) {}

  get label(): string | undefined {
    return this._membership.key;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const group = ctx.allocateLayoutEntry(this._membership.layout);

    ctx.addDeclaration(
      `@group(${group}) @binding(${this._membership.idx}) var ${id}: sampler_comparison;`,
    );

    return id;
  }
}
