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
 * WGSL language extensions, required via the `requires` directive
 * (as opposed to `enable` extensions, which are tied to optional device features).
 * Support is reported through `navigator.gpu.wgslLanguageFeatures`.
 */
export const wgslLanguageExtensions = {
  immediateAddressSpace: 'immediate_address_space',
} as const;
export type WgslLanguageExtension =
  (typeof wgslLanguageExtensions)[keyof typeof wgslLanguageExtensions];
