// ----------
// Public API
// ----------

import type { TgpuNamable } from '../../namable.ts';
import { $internal } from '../../shared/symbols.ts';
import type { LayoutMembership } from '../../tgpuBindGroupLayout.ts';
import type { ResolutionCtx, SelfResolvable } from '../../types.ts';
import type { Unwrapper } from '../../unwrapper.ts';

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

export interface TgpuLaidOutSamplerInternals {
  readonly fixed: false;
}

export interface TgpuSampler {
  readonly resourceType: 'sampler';
}

export interface TgpuComparisonSampler {
  readonly resourceType: 'sampler-comparison';
}

export interface TgpuLaidOutSampler extends TgpuSampler {
  readonly [$internal]: TgpuLaidOutSamplerInternals;
}

export interface TgpuLaidOutComparisonSampler extends TgpuComparisonSampler {
  readonly [$internal]: TgpuLaidOutSamplerInternals;
}

export interface TgpuFixedSamplerInternals {
  readonly fixed: true;
  unwrap(branch: Unwrapper): GPUSampler;
}

export interface TgpuFixedSampler extends TgpuSampler, TgpuNamable {
  readonly [$internal]: TgpuFixedSamplerInternals;
}

export interface TgpuFixedComparisonSampler
  extends TgpuComparisonSampler,
    TgpuNamable {
  readonly [$internal]: TgpuFixedSamplerInternals;
}

export function sampler(props: SamplerProps): TgpuSampler {
  return new TgpuFixedSamplerImpl(props);
}

export function comparisonSampler(
  props: ComparisonSamplerProps,
): TgpuComparisonSampler {
  return new TgpuFixedComparisonSamplerImpl(props);
}

export function isSampler(resource: unknown): resource is TgpuSampler {
  const maybeSampler = resource as
    | TgpuFixedSampler
    | TgpuLaidOutSampler
    | undefined;

  return maybeSampler?.resourceType === 'sampler' && !!maybeSampler[$internal];
}

export function isFixedSampler(
  resource: unknown,
): resource is TgpuFixedSampler {
  const maybeSampler = resource as TgpuFixedSampler | undefined;

  return (
    maybeSampler?.resourceType === 'sampler' && maybeSampler[$internal].fixed
  );
}

export function isLaidOutSampler(
  resource: unknown,
): resource is TgpuFixedSampler {
  const maybeSampler = resource as TgpuFixedSampler | undefined;

  return (
    maybeSampler?.resourceType === 'sampler' && !maybeSampler[$internal].fixed
  );
}

export function isComparisonSampler(
  resource: unknown,
): resource is TgpuComparisonSampler {
  const maybeSampler = resource as
    | TgpuFixedComparisonSampler
    | TgpuLaidOutComparisonSampler
    | undefined;

  return (
    maybeSampler?.resourceType === 'sampler-comparison' &&
    !!maybeSampler[$internal]
  );
}

export function isFixedComparisonSampler(
  resource: unknown,
): resource is TgpuFixedComparisonSampler {
  const maybeSampler = resource as TgpuFixedComparisonSampler | undefined;

  return (
    maybeSampler?.resourceType === 'sampler-comparison' &&
    maybeSampler[$internal].fixed
  );
}

export function isLaidOutComparisonSampler(
  resource: unknown,
): resource is TgpuFixedComparisonSampler {
  const maybeSampler = resource as TgpuFixedComparisonSampler | undefined;

  return (
    maybeSampler?.resourceType === 'sampler-comparison' &&
    !maybeSampler[$internal].fixed
  );
}

// --------------
// Implementation
// --------------

export class TgpuLaidOutSamplerImpl implements TgpuSampler, SelfResolvable {
  public readonly [$internal]: TgpuLaidOutSamplerInternals;
  public readonly resourceType = 'sampler';

  constructor(private readonly _membership: LayoutMembership) {
    this[$internal] = {
      fixed: false,
    };
  }

  get label(): string | undefined {
    return this._membership.key;
  }

  '~resolve'(ctx: ResolutionCtx): string {
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

export class TgpuLaidOutComparisonSamplerImpl
  implements TgpuComparisonSampler, SelfResolvable
{
  public readonly [$internal]: TgpuLaidOutSamplerInternals;
  public readonly resourceType = 'sampler-comparison';

  constructor(private readonly _membership: LayoutMembership) {
    this[$internal] = {
      fixed: false,
    };
  }

  get label(): string | undefined {
    return this._membership.key;
  }

  '~resolve'(ctx: ResolutionCtx): string {
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

class TgpuFixedSamplerImpl implements TgpuFixedSampler, SelfResolvable {
  public readonly [$internal]: TgpuFixedSamplerInternals;
  public readonly resourceType = 'sampler';

  private _label: string | undefined;
  private _filtering: boolean;
  private _sampler: GPUSampler | null = null;

  constructor(private readonly _props: SamplerProps) {
    // Based on https://www.w3.org/TR/webgpu/#sampler-creation
    this._filtering =
      _props.minFilter === 'linear' ||
      _props.magFilter === 'linear' ||
      _props.mipmapFilter === 'linear';

    this[$internal] = {
      fixed: true,
      unwrap: (branch) => {
        if (!this._sampler) {
          this._sampler = branch.device.createSampler({
            ...this._props,
            label: this._label ?? '<unnamed>',
          });
        }

        return this._sampler;
      },
    };
  }

  get label() {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
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

class TgpuFixedComparisonSamplerImpl
  implements TgpuFixedComparisonSampler, SelfResolvable
{
  public readonly [$internal]: TgpuFixedSamplerInternals;
  public readonly resourceType = 'sampler-comparison';

  private _label: string | undefined;
  private _sampler: GPUSampler | null = null;

  constructor(private readonly _props: ComparisonSamplerProps) {
    this[$internal] = {
      fixed: true,
      unwrap: (branch) => {
        if (!this._sampler) {
          this._sampler = branch.device.createSampler({
            ...this._props,
            label: this._label ?? '<unnamed>',
          });
        }

        return this._sampler;
      },
    };
  }

  get label(): string | undefined {
    return this._label;
  }

  $name(label: string) {
    this._label = label;
    return this;
  }

  '~resolve'(ctx: ResolutionCtx): string {
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
