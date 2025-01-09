// ----------
// Public API
// ----------

import type { TgpuNamable } from '../../namable';
import type { LayoutMembership } from '../../tgpuBindGroupLayout';
import type { ResolutionCtx, TgpuResolvable } from '../../types';

export interface SamplerProps {
  addressModeU?: GPUAddressMode;
  addressModeV?: GPUAddressMode;
  /**
   * Specifies the address modes for the texture width, height, and depth
   * coordinates, respectively.
   */
  addressModeW?: GPUAddressMode;
  /**
   * Specifies the sampling behavior when the sample footprint is smaller than or equal to one
   * texel.
   */
  magFilter?: GPUFilterMode;
  /**
   * Specifies the sampling behavior when the sample footprint is larger than one texel.
   */
  minFilter?: GPUFilterMode;
  /**
   * Specifies behavior for sampling between mipmap levels.
   */
  mipmapFilter?: GPUMipmapFilterMode;
  lodMinClamp?: number;
  /**
   * Specifies the minimum and maximum levels of detail, respectively, used internally when
   * sampling a texture.
   */
  lodMaxClamp?: number;
  /**
   * Specifies the maximum anisotropy value clamp used by the sampler. Anisotropic filtering is
   * enabled when {@link GPUSamplerDescriptor.maxAnisotropy} is > 1 and the implementation supports it.
   * Anisotropic filtering improves the image quality of textures sampled at oblique viewing
   * angles. Higher {@link GPUSamplerDescriptor.maxAnisotropy} values indicate the maximum ratio of
   * anisotropy supported when filtering.
   *
   * Most implementations support {@link GPUSamplerDescriptor.maxAnisotropy} values in range
   * between 1 and 16, inclusive. The used value of {@link GPUSamplerDescriptor.maxAnisotropy}
   * will be clamped to the maximum value that the platform supports.
   * The precise filtering behavior is implementation-dependent.
   */
  maxAnisotropy?: number;
}

export interface ComparisonSamplerProps {
  compare: GPUCompareFunction;
  addressModeU?: GPUAddressMode;
  addressModeV?: GPUAddressMode;
  /**
   * Specifies the address modes for the texture width, height, and depth
   * coordinates, respectively.
   */
  addressModeW?: GPUAddressMode;
  /**
   * Specifies the sampling behavior when the sample footprint is smaller than or equal to one
   * texel.
   */
  magFilter?: GPUFilterMode;
  /**
   * Specifies the sampling behavior when the sample footprint is larger than one texel.
   */
  minFilter?: GPUFilterMode;
  /**
   * Specifies behavior for sampling between mipmap levels.
   */
  mipmapFilter?: GPUMipmapFilterMode;
  lodMinClamp?: number;
  /**
   * Specifies the minimum and maximum levels of detail, respectively, used internally when
   * sampling a texture.
   */
  lodMaxClamp?: number;
  /**
   * Specifies the maximum anisotropy value clamp used by the sampler. Anisotropic filtering is
   * enabled when {@link GPUSamplerDescriptor.maxAnisotropy} is > 1 and the implementation supports it.
   * Anisotropic filtering improves the image quality of textures sampled at oblique viewing
   * angles. Higher {@link GPUSamplerDescriptor.maxAnisotropy} values indicate the maximum ratio of
   * anisotropy supported when filtering.
   *
   * Most implementations support {@link GPUSamplerDescriptor.maxAnisotropy} values in range
   * between 1 and 16, inclusive. The used value of {@link GPUSamplerDescriptor.maxAnisotropy}
   * will be clamped to the maximum value that the platform supports.
   * The precise filtering behavior is implementation-dependent.
   */
  maxAnisotropy?: number;
}

export interface TgpuSampler extends TgpuResolvable {
  readonly resourceType: 'sampler';
}

export interface TgpuComparisonSampler {
  readonly resourceType: 'sampler-comparison';
}

export interface TgpuFixedSampler extends TgpuSampler, TgpuNamable {}

export interface TgpuFixedComparisonSampler
  extends TgpuComparisonSampler,
    TgpuNamable {}

export function sampler(props: SamplerProps): TgpuSampler {
  return new TgpuFixedSamplerImpl(props);
}

export function comparisonSampler(
  props: ComparisonSamplerProps,
): TgpuComparisonSampler {
  return new TgpuFixedComparisonSamplerImpl(props);
}

export function isSampler(resource: unknown): resource is TgpuSampler {
  return (resource as TgpuSampler)?.resourceType === 'sampler';
}

export function isComparisonSampler(
  resource: unknown,
): resource is TgpuComparisonSampler {
  return (
    (resource as TgpuComparisonSampler)?.resourceType === 'sampler-comparison'
  );
}

// --------------
// Implementation
// --------------

export class TgpuLaidOutSamplerImpl implements TgpuSampler {
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

  toString() {
    return `${this.resourceType}:${this.label ?? '<unnamed>'}`;
  }
}

export class TgpuLaidOutComparisonSamplerImpl implements TgpuComparisonSampler {
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

  toString() {
    return `${this.resourceType}:${this.label ?? '<unnamed>'}`;
  }
}

class TgpuFixedSamplerImpl implements TgpuFixedSampler {
  public readonly resourceType = 'sampler';

  private _label: string | undefined;
  private _filtering: boolean;

  constructor(private readonly _props: SamplerProps) {
    // Based on https://www.w3.org/TR/webgpu/#sampler-creation
    this._filtering =
      _props.minFilter === 'linear' ||
      _props.magFilter === 'linear' ||
      _props.mipmapFilter === 'linear';
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this._label);

    const { group, binding } = ctx.allocateFixedEntry(
      {
        sampler: this._filtering ? 'filtering' : 'non-filtering',
      },
      this,
    );

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var ${id}: sampler;`,
    );

    return id;
  }

  toString() {
    return `${this.resourceType}:${this.label ?? '<unnamed>'}`;
  }
}

class TgpuFixedComparisonSamplerImpl implements TgpuFixedComparisonSampler {
  public readonly resourceType = 'sampler-comparison';

  private _label: string | undefined;

  constructor(private readonly _props: ComparisonSamplerProps) {}

  get label(): string | undefined {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  resolve(ctx: ResolutionCtx): string {
    const id = ctx.names.makeUnique(this.label);
    const { group, binding } = ctx.allocateFixedEntry(
      { sampler: 'comparison' },
      this,
    );

    ctx.addDeclaration(
      `@group(${group}) @binding(${binding}) var ${id}: sampler_comparison;`,
    );

    return id;
  }

  toString() {
    return `${this.resourceType}:${this.label ?? '<unnamed>'}`;
  }
}
