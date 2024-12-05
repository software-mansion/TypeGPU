import { f32, i32, u32 } from '../../data/numeric';
import { vec4f, vec4i, vec4u } from '../../data/vector';
import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from '../../data/wgslTypes';
import type { Default } from '../../shared/utilityTypes';
import type { TextureProps } from './textureProps';

export const texelFormatToChannelType = {
  r8unorm: f32 as F32,
  r8snorm: f32 as F32,
  r8uint: u32 as U32,
  r8sint: i32 as I32,
  r16uint: u32 as U32,
  r16sint: i32 as I32,
  r16float: f32 as F32,
  rg8unorm: f32 as F32,
  rg8snorm: f32 as F32,
  rg8uint: u32 as U32,
  rg8sint: i32 as I32,
  r32uint: u32 as U32,
  r32sint: i32 as I32,
  r32float: f32 as F32,
  rg16uint: u32 as U32,
  rg16sint: i32 as I32,
  rg16float: f32 as F32,
  rgba8unorm: f32 as F32,
  'rgba8unorm-srgb': f32 as F32,
  rgba8snorm: f32 as F32,
  rgba8uint: u32 as U32,
  rgba8sint: i32 as I32,
  bgra8unorm: f32 as F32,
  'bgra8unorm-srgb': f32 as F32,
  rgb9e5ufloat: f32 as F32,
  rgb10a2uint: u32 as U32,
  rgb10a2unorm: f32 as F32,
  rg11b10ufloat: f32 as F32,
  rg32uint: u32 as U32,
  rg32sint: i32 as I32,
  rg32float: f32 as F32,
  rgba16uint: u32 as U32,
  rgba16sint: i32 as I32,
  rgba16float: f32 as F32,
  rgba32uint: u32 as U32,
  rgba32sint: i32 as I32,
  rgba32float: f32 as F32,
  stencil8: f32 as F32, // NOTE: Honestly have no idea if this is right
  depth16unorm: f32 as F32,
  depth24plus: f32 as F32, // NOTE: Honestly have no idea if this is right
  'depth24plus-stencil8': f32 as F32, // NOTE: Honestly have no idea if this is right
  depth32float: f32 as F32,
  'depth32float-stencil8': f32 as F32,
  'bc1-rgba-unorm': f32 as F32,
  'bc1-rgba-unorm-srgb': f32 as F32,
  'bc2-rgba-unorm': f32 as F32,
  'bc2-rgba-unorm-srgb': f32 as F32,
  'bc3-rgba-unorm': f32 as F32,
  'bc3-rgba-unorm-srgb': f32 as F32,
  'bc4-r-unorm': f32 as F32,
  'bc4-r-snorm': f32 as F32,
  'bc5-rg-unorm': f32 as F32,
  'bc5-rg-snorm': f32 as F32,
  'bc6h-rgb-ufloat': f32 as F32,
  'bc6h-rgb-float': f32 as F32,
  'bc7-rgba-unorm': f32 as F32,
  'bc7-rgba-unorm-srgb': f32 as F32,
  'etc2-rgb8unorm': f32 as F32,
  'etc2-rgb8unorm-srgb': f32 as F32,
  'etc2-rgb8a1unorm': f32 as F32,
  'etc2-rgb8a1unorm-srgb': f32 as F32,
  'etc2-rgba8unorm': f32 as F32,
  'etc2-rgba8unorm-srgb': f32 as F32,
  'eac-r11unorm': f32 as F32,
  'eac-r11snorm': f32 as F32,
  'eac-rg11unorm': f32 as F32,
  'eac-rg11snorm': f32 as F32,
  'astc-4x4-unorm': f32 as F32,
  'astc-4x4-unorm-srgb': f32 as F32,
  'astc-5x4-unorm': f32 as F32,
  'astc-5x4-unorm-srgb': f32 as F32,
  'astc-5x5-unorm': f32 as F32,
  'astc-5x5-unorm-srgb': f32 as F32,
  'astc-6x5-unorm': f32 as F32,
  'astc-6x5-unorm-srgb': f32 as F32,
  'astc-6x6-unorm': f32 as F32,
  'astc-6x6-unorm-srgb': f32 as F32,
  'astc-8x5-unorm': f32 as F32,
  'astc-8x5-unorm-srgb': f32 as F32,
  'astc-8x6-unorm': f32 as F32,
  'astc-8x6-unorm-srgb': f32 as F32,
  'astc-8x8-unorm': f32 as F32,
  'astc-8x8-unorm-srgb': f32 as F32,
  'astc-10x5-unorm': f32 as F32,
  'astc-10x5-unorm-srgb': f32 as F32,
  'astc-10x6-unorm': f32 as F32,
  'astc-10x6-unorm-srgb': f32 as F32,
  'astc-10x8-unorm': f32 as F32,
  'astc-10x8-unorm-srgb': f32 as F32,
  'astc-10x10-unorm': f32 as F32,
  'astc-10x10-unorm-srgb': f32 as F32,
  'astc-12x10-unorm': f32 as F32,
  'astc-12x10-unorm-srgb': f32 as F32,
  'astc-12x12-unorm': f32 as F32,
  'astc-12x12-unorm-srgb': f32 as F32,
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
  rgba8unorm: vec4f as Vec4f,
  rgba8snorm: vec4f as Vec4f,
  rgba8uint: vec4u as Vec4u,
  rgba8sint: vec4i as Vec4i,
  rgba16uint: vec4u as Vec4u,
  rgba16sint: vec4i as Vec4i,
  rgba16float: vec4f as Vec4f,
  r32uint: vec4u as Vec4u,
  r32sint: vec4i as Vec4i,
  r32float: vec4f as Vec4f,
  rg32uint: vec4u as Vec4u,
  rg32sint: vec4i as Vec4i,
  rg32float: vec4f as Vec4f,
  rgba32uint: vec4u as Vec4u,
  rgba32sint: vec4i as Vec4i,
  rgba32float: vec4f as Vec4f,
  bgra8unorm: vec4f as Vec4f,
} as const;

export const channelKindToFormat = {
  f32: 'float',
  u32: 'uint',
  i32: 'sint',
} as const;

export type TexelFormatToDataType = typeof texelFormatToDataType;
export type TexelFormatToDataTypeOrNever<T> =
  T extends keyof TexelFormatToDataType ? TexelFormatToDataType[T] : never;

/**
 * Represents what formats a storage view can choose from based on its owner texture's props.
 */
export type StorageFormatOptions<TProps extends TextureProps> = Extract<
  TProps['format'] | Default<TProps['viewFormats'], []>[number],
  StorageTextureTexelFormat
>;

/**
 * Represents what formats a sampled view can choose from based on its owner texture's props.
 */
export type SampledFormatOptions<TProps extends TextureProps> =
  | TProps['format']
  | Default<TProps['viewFormats'], []>[number];
