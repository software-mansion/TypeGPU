import {
  type F32,
  type I32,
  type U32,
  f32,
  i32,
  u32,
  vec4f,
  vec4i,
  vec4u,
} from '../../data';

export const texelFormatToChannelType = {
  r8unorm: f32,
  r8snorm: f32,
  r8uint: u32,
  r8sint: i32,
  r16uint: u32,
  r16sint: i32,
  r16float: f32,
  rg8unorm: f32,
  rg8snorm: f32,
  rg8uint: u32,
  rg8sint: i32,
  r32uint: u32,
  r32sint: i32,
  r32float: f32,
  rg16uint: u32,
  rg16sint: i32,
  rg16float: f32,
  rgba8unorm: f32,
  'rgba8unorm-srgb': f32,
  rgba8snorm: f32,
  rgba8uint: u32,
  rgba8sint: i32,
  bgra8unorm: f32,
  'bgra8unorm-srgb': f32,
  rgb9e5ufloat: f32,
  rgb10a2uint: u32,
  rgb10a2unorm: f32,
  rg11b10ufloat: f32,
  rg32uint: u32,
  rg32sint: i32,
  rg32float: f32,
  rgba16uint: u32,
  rgba16sint: i32,
  rgba16float: f32,
  rgba32uint: u32,
  rgba32sint: i32,
  rgba32float: f32,
  stencil8: f32, // NOTE: Honestly have no idea if this is right
  depth16unorm: f32,
  depth24plus: f32, // NOTE: Honestly have no idea if this is right
  'depth24plus-stencil8': f32, // NOTE: Honestly have no idea if this is right
  depth32float: f32,
  'depth32float-stencil8': f32,
  'bc1-rgba-unorm': f32,
  'bc1-rgba-unorm-srgb': f32,
  'bc2-rgba-unorm': f32,
  'bc2-rgba-unorm-srgb': f32,
  'bc3-rgba-unorm': f32,
  'bc3-rgba-unorm-srgb': f32,
  'bc4-r-unorm': f32,
  'bc4-r-snorm': f32,
  'bc5-rg-unorm': f32,
  'bc5-rg-snorm': f32,
  'bc6h-rgb-ufloat': f32,
  'bc6h-rgb-float': f32,
  'bc7-rgba-unorm': f32,
  'bc7-rgba-unorm-srgb': f32,
  'etc2-rgb8unorm': f32,
  'etc2-rgb8unorm-srgb': f32,
  'etc2-rgb8a1unorm': f32,
  'etc2-rgb8a1unorm-srgb': f32,
  'etc2-rgba8unorm': f32,
  'etc2-rgba8unorm-srgb': f32,
  'eac-r11unorm': f32,
  'eac-r11snorm': f32,
  'eac-rg11unorm': f32,
  'eac-rg11snorm': f32,
  'astc-4x4-unorm': f32,
  'astc-4x4-unorm-srgb': f32,
  'astc-5x4-unorm': f32,
  'astc-5x4-unorm-srgb': f32,
  'astc-5x5-unorm': f32,
  'astc-5x5-unorm-srgb': f32,
  'astc-6x5-unorm': f32,
  'astc-6x5-unorm-srgb': f32,
  'astc-6x6-unorm': f32,
  'astc-6x6-unorm-srgb': f32,
  'astc-8x5-unorm': f32,
  'astc-8x5-unorm-srgb': f32,
  'astc-8x6-unorm': f32,
  'astc-8x6-unorm-srgb': f32,
  'astc-8x8-unorm': f32,
  'astc-8x8-unorm-srgb': f32,
  'astc-10x5-unorm': f32,
  'astc-10x5-unorm-srgb': f32,
  'astc-10x6-unorm': f32,
  'astc-10x6-unorm-srgb': f32,
  'astc-10x8-unorm': f32,
  'astc-10x8-unorm-srgb': f32,
  'astc-10x10-unorm': f32,
  'astc-10x10-unorm-srgb': f32,
  'astc-12x10-unorm': f32,
  'astc-12x10-unorm-srgb': f32,
  'astc-12x12-unorm': f32,
  'astc-12x12-unorm-srgb': f32,
} satisfies Record<GPUTextureFormat, U32 | I32 | F32>;

export type TexelFormatToChannelType = typeof texelFormatToChannelType;

/**
 * https://www.w3.org/TR/WGSL/#storage-texel-formats
 */
export type StorageTextureTexelFormat =
  | 'rgba8unorm'
  | 'rgba8snorm'
  | 'rgba8uint'
  | 'rgba8sint'
  | 'rgba16uint'
  | 'rgba16sint'
  | 'rgba16float'
  | 'r32uint'
  | 'r32sint'
  | 'r32float'
  | 'rg32uint'
  | 'rg32sint'
  | 'rg32float'
  | 'rgba32uint'
  | 'rgba32sint'
  | 'rgba32float'
  | 'bgra8unorm';

export const texelFormatToDataType = {
  rgba8unorm: vec4f,
  rgba8snorm: vec4f,
  rgba8uint: vec4u,
  rgba8sint: vec4i,
  rgba16uint: vec4u,
  rgba16sint: vec4i,
  rgba16float: vec4f,
  r32uint: vec4u,
  r32sint: vec4i,
  r32float: vec4f,
  rg32uint: vec4u,
  rg32sint: vec4i,
  rg32float: vec4f,
  rgba32uint: vec4u,
  rgba32sint: vec4i,
  rgba32float: vec4f,
  bgra8unorm: vec4f,
} as const;

export type TexelFormatToDataType = typeof texelFormatToDataType;
export type TexelFormatToDataTypeOrNever<T> =
  T extends keyof TexelFormatToDataType ? TexelFormatToDataType[T] : never;
