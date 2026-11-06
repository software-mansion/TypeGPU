export const wgslEnableExtensions = [
  'f16',
  'clip_distances',
  'dual_source_blending',
  'subgroups',
  'primitive_index',
] as const;
export type WgslEnableExtension = (typeof wgslEnableExtensions)[number];

export const wgslEnableExtensionToFeatureName: Record<WgslEnableExtension, GPUFeatureName> = {
  f16: 'shader-f16',
  clip_distances: 'clip-distances',
  dual_source_blending: 'dual-source-blending',
  subgroups: 'subgroups',
  primitive_index: 'primitive-index',
};

/**
 * WGSL language extensions, listed in `requires` directives.
 * Supported ones are listed in `root.enabledWgslLanguageFeatures`.
 */
export type WgslLanguageFeature =
  | 'readonly_and_readwrite_storage_textures'
  | 'packed_4x8_integer_dot_product'
  | 'unrestricted_pointer_parameters'
  | 'pointer_composite_access'
  | 'uniform_buffer_standard_layout'
  | 'subgroup_id'
  | 'subgroup_uniformity'
  | 'texture_and_sampler_let'
  | 'texture_formats_tier1'
  | 'linear_indexing'
  | 'immediate_address_space'
  | 'buffer_view';

export function assertLanguageFeature(
  root: { readonly enabledWgslLanguageFeatures: ReadonlySet<string> },
  feature: WgslLanguageFeature,
  usage: string,
  fallback: string,
): void {
  if (!root.enabledWgslLanguageFeatures.has(feature)) {
    throw new Error(
      `${usage} cannot be used, because the '${feature}' WGSL language extension is not supported in this environment. Check support with root.enabledWgslLanguageFeatures and fall back to ${fallback} when unavailable.`,
    );
  }
}
