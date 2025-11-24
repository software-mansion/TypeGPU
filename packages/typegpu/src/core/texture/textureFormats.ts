import { f32, i32, u32 } from '../../data/numeric.ts';
import { vec4f, vec4i, vec4u } from '../../data/vector.ts';
import type { F32, I32, U32 } from '../../data/wgslTypes.ts';

export type ViewDimensionToDimension = {
  '1d': '1d';
  '2d': '2d';
  '2d-array': '2d';
  '3d': '3d';
  cube: '2d';
  'cube-array': '2d';
};

/**
 * https://www.w3.org/TR/WGSL/#storage-texel-formats
 */
export type StorageTextureFormats =
  | 'rgba8unorm'
  | 'rgba8snorm'
  | 'rgba8uint'
  | 'rgba8sint'
  | 'rgba16unorm'
  | 'rgba16snorm'
  | 'rgba16uint'
  | 'rgba16sint'
  | 'rgba16float'
  | 'rg8unorm'
  | 'rg8snorm'
  | 'rg8uint'
  | 'rg8sint'
  | 'rg16unorm'
  | 'rg16snorm'
  | 'rg16uint'
  | 'rg16sint'
  | 'rg16float'
  | 'r32uint'
  | 'r32sint'
  | 'r32float'
  | 'rg32uint'
  | 'rg32sint'
  | 'rg32float'
  | 'rgba32uint'
  | 'rgba32sint'
  | 'rgba32float'
  | 'bgra8unorm'
  | 'r8unorm'
  | 'r8snorm'
  | 'r8uint'
  | 'r8sint'
  | 'r16unorm'
  | 'r16snorm'
  | 'r16uint'
  | 'r16sint'
  | 'r16float'
  | 'rgb10a2unorm'
  | 'rgb10a2uint'
  | 'rg11b10ufloat';

// TODO: use this for texture view validation
// deno-fmt-ignore - this is not really meant to be read
export const textureFormats = {
  // 8-bit formats
  'r8unorm': { channelType: f32, vectorType: vec4f, texelSize: 1, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'r8snorm': { channelType: f32, vectorType: vec4f, texelSize: 1, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'r8uint': { channelType: u32, vectorType: vec4u, texelSize: 1, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'r8sint': { channelType: i32, vectorType: vec4i, texelSize: 1, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },

  'rg8unorm': { channelType: f32, vectorType: vec4f, texelSize: 2, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only'] },
  'rg8snorm': { channelType: f32, vectorType: vec4f, texelSize: 2, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg8uint': { channelType: u32, vectorType: vec4u, texelSize: 2, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg8sint': { channelType: i32, vectorType: vec4i, texelSize: 2, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },

  'rgba8unorm': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'rgba8unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: null },
  'rgba8snorm': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rgba8uint': { channelType: u32, vectorType: vec4u, texelSize: 4, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'rgba8sint': { channelType: i32, vectorType: vec4i, texelSize: 4, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },

  'bgra8unorm': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only'] },
  'bgra8unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: null },

  // 16-bit formats
  'r16unorm': { channelType: f32, vectorType: vec4f, texelSize: 2, sampleTypes: ['unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'r16snorm': { channelType: f32, vectorType: vec4f, texelSize: 2, sampleTypes: ['unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'r16uint': { channelType: u32, vectorType: vec4u, texelSize: 2, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'r16sint': { channelType: i32, vectorType: vec4i, texelSize: 2, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'r16float': { channelType: f32, vectorType: vec4f, texelSize: 2, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only', 'read-write'] },

  'rg16unorm': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg16snorm': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg16uint': { channelType: u32, vectorType: vec4u, texelSize: 4, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg16sint': { channelType: i32, vectorType: vec4i, texelSize: 4, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg16float': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only'] },

  'rgba16unorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rgba16snorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rgba16uint': { channelType: u32, vectorType: vec4u, texelSize: 8, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'rgba16sint': { channelType: i32, vectorType: vec4i, texelSize: 8, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'rgba16float': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only', 'read-write'] },

  // 32-bit formats
  'r32uint': { channelType: u32, vectorType: vec4u, texelSize: 4, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'r32sint': { channelType: i32, vectorType: vec4i, texelSize: 4, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'r32float': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },

  'rg32uint': { channelType: u32, vectorType: vec4u, texelSize: 8, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg32sint': { channelType: i32, vectorType: vec4i, texelSize: 8, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rg32float': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },

  'rgba32uint': { channelType: u32, vectorType: vec4u, texelSize: 16, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'rgba32sint': { channelType: i32, vectorType: vec4i, texelSize: 16, sampleTypes: ['sint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },
  'rgba32float': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: false, canResolve: false, storageBindings: ['write-only', 'read-only', 'read-write'] },

  // Mixed component formats
  'rgb10a2uint': { channelType: u32, vectorType: vec4u, texelSize: 4, sampleTypes: ['uint'], aspects: ['color'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: ['write-only', 'read-only'] },
  'rgb10a2unorm': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only'] },
  'rg11b10ufloat': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: true, canBlend: true, canMultisample: true, canResolve: true, storageBindings: ['write-only', 'read-only'] },

  // Special formats
  'rgb9e5ufloat': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },

  // Depth/Stencil formats
  'stencil8': { channelType: u32, vectorType: vec4u, texelSize: 1, sampleTypes: ['uint'], aspects: ['stencil'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: null },
  'depth16unorm': { channelType: f32, vectorType: vec4f, texelSize: 2, sampleTypes: ['depth', 'unfilterable-float'], aspects: ['depth'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: null },
  'depth24plus': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['depth', 'unfilterable-float'], aspects: ['depth'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: null },
  'depth24plus-stencil8': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['depth', 'unfilterable-float'], aspects: ['depth', 'stencil'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: null },
  'depth32float': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['depth', 'unfilterable-float'], aspects: ['depth'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: null },
  'depth32float-stencil8': { channelType: f32, vectorType: vec4f, texelSize: 4, sampleTypes: ['depth', 'unfilterable-float'], aspects: ['depth', 'stencil'], canRenderAttachment: true, canBlend: false, canMultisample: true, canResolve: false, storageBindings: null },

  // BC compressed formats
  'bc1-rgba-unorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc1-rgba-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc2-rgba-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc2-rgba-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc3-rgba-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc3-rgba-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc4-r-unorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc4-r-snorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc5-rg-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc5-rg-snorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc6h-rgb-ufloat': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc6h-rgb-float': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc7-rgba-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'bc7-rgba-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },

  // ETC2/EAC compressed formats
  'etc2-rgb8unorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'etc2-rgb8unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'etc2-rgb8a1unorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'etc2-rgb8a1unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'etc2-rgba8unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'etc2-rgba8unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'eac-r11unorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'eac-r11snorm': { channelType: f32, vectorType: vec4f, texelSize: 8, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'eac-rg11unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'eac-rg11snorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },

  // ASTC compressed formats
  'astc-4x4-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-4x4-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-5x4-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-5x4-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-5x5-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-5x5-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-6x5-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-6x5-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-6x6-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-6x6-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-8x5-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-8x5-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-8x6-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-8x6-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-8x8-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-8x8-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x5-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x5-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x6-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x6-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x8-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x8-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x10-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-10x10-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-12x10-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-12x10-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-12x12-unorm': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
  'astc-12x12-unorm-srgb': { channelType: f32, vectorType: vec4f, texelSize: 16, sampleTypes: ['float', 'unfilterable-float'], aspects: ['color'], canRenderAttachment: false, canBlend: false, canMultisample: false, canResolve: false, storageBindings: null },
} as const satisfies Record<GPUTextureFormat, TextureFormatInfo>;

export type TextureFormatInfo = {
  readonly channelType: F32 | I32 | U32;
  readonly vectorType: typeof vec4f | typeof vec4i | typeof vec4u;
  readonly texelSize: number;
  readonly sampleTypes: readonly string[];
  readonly aspects: readonly string[];
  readonly canRenderAttachment: boolean;
  readonly canBlend: boolean;
  readonly canMultisample: boolean;
  readonly canResolve: boolean;
  readonly storageBindings: readonly string[] | null;
};

export type TextureFormats = typeof textureFormats;

export function getDeviceTextureFormatInfo<T extends GPUTextureFormat>(
  format: T,
  device: GPUDevice,
): typeof textureFormats[T] {
  const baseInfo = textureFormats[format];

  if (!baseInfo) {
    throw new Error(`Unknown texture format: ${format}`);
  }

  let filteredInfo = { ...baseInfo } as TextureFormatInfo;
  switch (format) {
    case 'r32float':
    case 'rg32float':
    case 'rgba32float':
      if (!device.features.has('float32-filterable')) {
        filteredInfo = {
          ...filteredInfo,
          sampleTypes: baseInfo.sampleTypes.filter((type) => type !== 'float'),
        } as TextureFormatInfo;
      }
      if (!device.features.has('float32-blendable')) {
        filteredInfo = {
          ...filteredInfo,
          canBlend: false,
        };
      }
      break;

    case 'bgra8unorm':
      if (!device.features.has('bgra8unorm-storage')) {
        filteredInfo = {
          ...filteredInfo,
          storageBindings: null,
        };
      }
      break;

    case 'rg11b10ufloat':
      if (!device.features.has('rg11b10ufloat-renderable')) {
        filteredInfo = {
          ...filteredInfo,
          canRenderAttachment: false,
          canBlend: false,
          canMultisample: false,
          canResolve: false,
        };
      }
      break;
  }

  if (filteredInfo.storageBindings) {
    const hasTexture1 = device.features.has('texture-formats-tier1');
    const hasTexture2 = device.features.has('texture-formats-tier2');

    let availableBindings = [...filteredInfo.storageBindings];

    // deno-fmt-ignore
    const tier2RequiredFormats = [
      'r8unorm', 'r8uint', 'r8sint',
      'r16uint', 'r16sint', 'r16float',
      'rgba8unorm', 'rgba8uint', 'rgba8sint',
      'rgba16uint', 'rgba16sint', 'rgba16float',
      'r32uint', 'r32sint', 'r32float',
      'rgba32uint', 'rgba32sint', 'rgba32float',
    ];

    // deno-fmt-ignore
    const tier1RequiredFormats = [
      'r8snorm',
      'rg8unorm', 'rg8snorm', 'rg8uint', 'rg8sint',
      'rgba8snorm',
      'r16unorm', 'r16snorm',
      'rg16unorm', 'rg16snorm', 'rg16uint', 'rg16sint', 'rg16float',
      'rgba16unorm', 'rgba16snorm',
      'rgb10a2uint', 'rgb10a2unorm', 'rg11b10ufloat',
    ];

    if (tier2RequiredFormats.includes(format) && !hasTexture2) {
      availableBindings = availableBindings.filter((binding) =>
        binding !== 'read-write'
      );
    }

    if (tier1RequiredFormats.includes(format) && !hasTexture1) {
      availableBindings = availableBindings.filter(
        (binding) => binding !== 'write-only' && binding !== 'read-only',
      );
    }

    filteredInfo = {
      ...filteredInfo,
      storageBindings: availableBindings.length > 0 ? availableBindings : null,
    };
  }

  return filteredInfo as typeof textureFormats[T];
}
