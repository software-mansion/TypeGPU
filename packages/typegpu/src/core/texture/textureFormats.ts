import { f32, i32, u32 } from '../../data/numeric.ts';
import { vec4f, vec4i, vec4u } from '../../data/vector.ts';
import type { F32, I32, U32, Vec4f, Vec4i, Vec4u } from '../../data/wgslTypes.ts';

export type ViewDimensionToDimension = {
  '1d': '1d';
  '2d': '2d';
  '2d-array': '2d';
  '3d': '3d';
  cube: '2d';
  'cube-array': '2d';
};

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

type ParseChannelType<T extends GPUTextureFormat> = T extends `${string}uint${string}`
  ? 'u32'
  : T extends `${string}sint${string}`
    ? 'i32'
    : 'f32';

type ChannelTypeToSampleType<T extends 'f32' | 'i32' | 'u32'> = {
  f32: F32;
  i32: I32;
  u32: U32;
}[T];

type ChannelTypeToVectorType<T extends 'f32' | 'i32' | 'u32'> = {
  f32: Vec4f;
  i32: Vec4i;
  u32: Vec4u;
}[T];

export type TextureFormats = {
  [K in GPUTextureFormat]: {
    channelType: ChannelTypeToSampleType<ParseChannelType<K>>;
    vectorType: ChannelTypeToVectorType<ParseChannelType<K>>;
  };
};

// Runtime

export type AspectInfo = {
  readonly channelType: F32 | I32 | U32;
  readonly vectorType: Vec4f | Vec4i | Vec4u;
  readonly sampleTypes: readonly GPUTextureSampleType[];
};

export type TextureFormatInfo = {
  readonly channelType: F32 | I32 | U32;
  readonly vectorType: Vec4f | Vec4i | Vec4u;
  readonly texelSize: number | 'non-copyable';
  readonly sampleTypes: readonly GPUTextureSampleType[];
  readonly canRenderAttachment: boolean;
  readonly depthAspect?: AspectInfo & {
    readonly texelSize: number | 'non-copyable';
  };
  readonly stencilAspect?: AspectInfo & { readonly texelSize: number };
};

const DEPTH_ASPECT_NON_COPYABLE = {
  channelType: f32,
  vectorType: vec4f,
  sampleTypes: ['depth', 'unfilterable-float'],
  texelSize: 'non-copyable',
} as const;

const DEPTH_ASPECT_16 = {
  channelType: f32,
  vectorType: vec4f,
  sampleTypes: ['depth', 'unfilterable-float'],
  texelSize: 2,
} as const;

const DEPTH_ASPECT_32 = {
  channelType: f32,
  vectorType: vec4f,
  sampleTypes: ['depth', 'unfilterable-float'],
  texelSize: 4,
} as const;

const STENCIL_ASPECT = {
  channelType: u32,
  vectorType: vec4u,
  sampleTypes: ['uint'],
  texelSize: 1,
} as const;

const formatInfoCache = new Map<GPUTextureFormat, TextureFormatInfo>();

export function getTextureFormatInfo(format: GPUTextureFormat): TextureFormatInfo {
  let info = formatInfoCache.get(format);
  if (info === undefined) {
    info = createFormatInfo(format);
    formatInfoCache.set(format, info);
  }
  return info;
}

function createFormatInfo(format: GPUTextureFormat): TextureFormatInfo {
  const channelType = parseChannelType(format);
  const depthAspect = getDepthAspect(format);
  const hasStencil = format.includes('stencil');

  return {
    channelType,
    vectorType: channelType === u32 ? vec4u : channelType === i32 ? vec4i : vec4f,
    texelSize: parseTexelSize(format),
    sampleTypes: parseSampleTypes(format),
    canRenderAttachment: canRenderAttachment(format),
    ...(depthAspect && { depthAspect }),
    ...(hasStencil && { stencilAspect: STENCIL_ASPECT }),
  };
}

function getDepthAspect(format: GPUTextureFormat) {
  if (format === 'depth16unorm') return DEPTH_ASPECT_16;
  if (format === 'depth32float' || format === 'depth32float-stencil8') {
    return DEPTH_ASPECT_32;
  }
  if (format === 'depth24plus' || format === 'depth24plus-stencil8') {
    return DEPTH_ASPECT_NON_COPYABLE;
  }
  return undefined;
}

function canRenderAttachment(format: GPUTextureFormat): boolean {
  if (
    format.startsWith('bc') ||
    format.startsWith('etc2') ||
    format.startsWith('eac') ||
    format.startsWith('astc')
  ) {
    return false;
  }
  if (format === 'rgb9e5ufloat') return false;
  return true;
}

function parseChannelType(format: GPUTextureFormat): F32 | I32 | U32 {
  if (format === 'stencil8') return u32;
  if (format.includes('uint')) return u32;
  if (format.includes('sint')) return i32;
  return f32;
}

function parseTexelSize(format: GPUTextureFormat): number | 'non-copyable' {
  // Standard formats: channel count encoded in prefix length (r=1, rg=2, rgba/bgra=4)
  const [, channels, bits] = format.match(/^(rgba|bgra|rg|r)(8|16|32)/) ?? [];
  if (channels && bits) {
    return (channels.length * Number(bits)) / 8;
  }

  // Depth/stencil
  if (format === 'stencil8') return 1;
  if (format === 'depth16unorm') return 2;
  if (format === 'depth32float') return 4;
  if (format === 'depth32float-stencil8') return 5;
  // depth24plus formats have undefined copy size
  if (format === 'depth24plus' || format === 'depth24plus-stencil8') {
    return 'non-copyable';
  }

  // Compressed: 8-byte blocks (bc1, bc4, etc2-rgb8*, eac-r11*)
  if (/^(bc[14]-|etc2-rgb8|eac-r11)/.test(format)) return 8;
  // Compressed: 16-byte blocks (bc2-7, astc, etc2-rgba8*, eac-rg11*)
  if (/^(bc|astc-|etc2-rgba|eac-rg)/.test(format)) return 16;

  // Packed 32-bit (rgb9e5ufloat, rgb10a2unorm, rgb10a2uint, rg11b10ufloat)
  return 4;
}

function parseSampleTypes(format: string): readonly GPUTextureSampleType[] {
  if (format === 'stencil8') return ['uint'];
  if (format.includes('uint')) return ['uint'];
  if (format.includes('sint')) return ['sint'];
  if (format.includes('depth')) return ['depth', 'unfilterable-float'];
  if (/^(r|rg|rgba)16(u|s)norm$/.test(format)) return ['unfilterable-float'];
  return ['float', 'unfilterable-float'];
}

const FLOAT32_FORMATS = new Set(['r32float', 'rg32float', 'rgba32float']);

export function getEffectiveSampleTypes(
  device: GPUDevice,
  format: GPUTextureFormat,
): readonly GPUTextureSampleType[] {
  if (FLOAT32_FORMATS.has(format) && !device.features.has('float32-filterable')) {
    return ['unfilterable-float'];
  }
  return getTextureFormatInfo(format).sampleTypes;
}
