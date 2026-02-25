import { $internal, $repr } from '../shared/symbols.ts';
import type { BaseData } from './wgslTypes.ts';

export interface WgslSamplerProps {
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

export interface WgslComparisonSamplerProps {
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

export interface sampler {
  [$internal]: true;
  type: 'sampler';
}

export function sampler(): WgslSampler {
  return {
    [$internal]: {},
    type: 'sampler',
    [$repr]: undefined as unknown as sampler,
  };
}

export interface comparisonSampler {
  [$internal]: Record<string, never>;
  type: 'sampler_comparison';
}

export function comparisonSampler(): WgslComparisonSampler {
  return {
    [$internal]: {},
    type: 'sampler_comparison',
    [$repr]: undefined as unknown as comparisonSampler,
  };
}

export interface WgslSampler extends BaseData {
  readonly [$repr]: sampler;
  readonly type: 'sampler';
}

export interface WgslComparisonSampler extends BaseData {
  readonly [$repr]: comparisonSampler;
  readonly type: 'sampler_comparison';
}

export function isWgslSampler(value: unknown): value is WgslSampler {
  return !!(value as WgslSampler)[$internal] && (value as WgslSampler).type === 'sampler';
}

export function isWgslComparisonSampler(value: unknown): value is WgslComparisonSampler {
  return (
    !!(value as WgslComparisonSampler)[$internal] &&
    (value as WgslComparisonSampler).type === 'sampler_comparison'
  );
}
