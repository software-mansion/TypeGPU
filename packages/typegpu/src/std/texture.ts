import { stitch } from '../core/resolve/stitch.ts';
import type {
  TgpuComparisonSampler,
  TgpuSampler,
} from '../core/sampler/sampler.ts';
import {
  isWgslSampledTexture,
  type WgslExternalTexture,
  type WgslSampledTexture,
  type WgslStorageTexture,
} from '../data/texture.ts';
import type { TexelData } from '../core/texture/texture.ts';
import { dualImpl } from '../core/function/dualImpl.ts';
import { f32, u32 } from '../data/numeric.ts';
import { vec2u, vec3u, vec4f, vec4i, vec4u } from '../data/vector.ts';
import {
  type v2f,
  type v2i,
  type v2u,
  type v3f,
  type v3i,
  type v3u,
  type v4f,
  type v4i,
  type v4u,
  Void,
} from '../data/wgslTypes.ts';
import {
  type StorageTextureFormats,
  texelFormatToDataType,
} from '../core/texture/textureFormats.ts';
import type { $repr } from '../shared/symbols.ts';

function sampleCpu<T extends WgslSampledTexture<'1d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: number,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'2d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'2d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  offset: v2i,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'2d-array'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'2d-array'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
  offset: v2i,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'3d' | 'cube'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'3d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  offset: v3i,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'cube-array'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  arrayIndex: number,
): v4f;
function sampleCpu<T extends WgslSampledTexture<'2d', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
): number;
function sampleCpu<T extends WgslSampledTexture<'2d', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  offset: v2i,
): number;
function sampleCpu<T extends WgslSampledTexture<'2d-array', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
): number;
function sampleCpu<T extends WgslSampledTexture<'2d-array', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
  offset: v2i,
): number;
function sampleCpu<T extends WgslSampledTexture<'cube', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
): number;
function sampleCpu<T extends WgslSampledTexture<'cube-array', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  arrayIndex: number,
): number;
function sampleCpu(
  _texture: WgslSampledTexture,
  _sampler: TgpuSampler,
  _coords: number | v2f | v3f,
  _offsetOrArrayIndex?: v2i | v3i | number,
  _maybeOffset?: v2i | v3i,
): v4f | number {
  throw new Error(
    'Texture sampling relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSample = dualImpl({
  name: 'textureSample',
  normalImpl: sampleCpu,
  codegenImpl: (...args) => stitch`textureSample(${args})`,
  signature: (...args) => {
    const isDepth = (args[0] as WgslSampledTexture).sampleType === 'depth';
    return {
      argTypes: args,
      returnType: isDepth ? f32 : vec4f,
    };
  },
});

function sampleLevelCpu<T extends WgslSampledTexture<'1d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: number,
  level: number,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'2d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  level: number,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'2d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  level: number,
  offset: v2i,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'2d-array'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'2d-array'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
  offset: v2i,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'3d' | 'cube'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  level: number,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'3d'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  level: number,
  offset: v3i,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'cube-array'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  arrayIndex: number,
  level: number,
): v4f;
function sampleLevelCpu<T extends WgslSampledTexture<'2d', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  level: number,
): number;
function sampleLevelCpu<T extends WgslSampledTexture<'2d', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  level: number,
  offset: v2i,
): number;
function sampleLevelCpu<T extends WgslSampledTexture<'2d-array', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
): number;
function sampleLevelCpu<T extends WgslSampledTexture<'2d-array', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
  offset: v2i,
): number;
function sampleLevelCpu<T extends WgslSampledTexture<'cube', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  level: number,
): number;
function sampleLevelCpu<T extends WgslSampledTexture<'cube-array', 'depth'>>(
  texture: T,
  sampler: TgpuSampler,
  coords: v3f,
  arrayIndex: number,
  level: number,
): number;
function sampleLevelCpu(
  _texture: WgslSampledTexture,
  _sampler: TgpuSampler,
  _coords: number | v2f | v3f,
  _level: number,
  _offsetOrArrayIndex?: v2i | v3i | number,
  _maybeOffset?: v2i | v3i,
): v4f | number {
  throw new Error(
    'Texture sampling relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSampleLevel = dualImpl({
  name: 'textureSampleLevel',
  normalImpl: sampleLevelCpu,
  codegenImpl: (...args) => stitch`textureSampleLevel(${args})`,
  signature: (...args) => {
    const isDepth = (args[0] as WgslSampledTexture).sampleType === 'depth';
    return {
      argTypes: args,
      returnType: isDepth ? f32 : vec4f,
    };
  },
});

type SampleTypeToReturnType<ST extends GPUTextureSampleType> = {
  float: v4f;
  'unfilterable-float': v4f;
  depth: number;
  sint: v4i;
  uint: v4u;
}[ST];
const sampleTypeToReturnType = {
  float: vec4f,
  'unfilterable-float': vec4f,
  depth: f32,
  sint: vec4i,
  uint: vec4u,
};

type TexelFormatToInstanceType<T extends StorageTextureFormats> =
  (typeof texelFormatToDataType)[T][typeof $repr];

function textureLoadCpu<T extends WgslSampledTexture<'1d'>>(
  texture: T,
  coords: number,
  level: number,
): SampleTypeToReturnType<T['sampleType']>;
function textureLoadCpu<T extends WgslSampledTexture<'2d'>>(
  texture: T,
  coords: v2i | v2u,
  level: number,
): SampleTypeToReturnType<T['sampleType']>;
function textureLoadCpu<T extends WgslSampledTexture<'2d-array'>>(
  texture: T,
  coords: v2i | v2u,
  arrayIndex: number,
  level: number,
): SampleTypeToReturnType<T['sampleType']>;
function textureLoadCpu<T extends WgslSampledTexture<'3d'>>(
  texture: T,
  coords: v3i | v3u,
  level: number,
): SampleTypeToReturnType<T['sampleType']>;
function textureLoadCpu<
  T extends WgslSampledTexture<'2d', GPUTextureSampleType, true>,
>(
  texture: T,
  coords: v2i | v2u,
  sampleIndex: number,
): SampleTypeToReturnType<T['sampleType']>;
function textureLoadCpu<
  T extends WgslStorageTexture<'1d'>,
>(
  texture: T,
  coords: number,
): TexelFormatToInstanceType<T['format']>;
function textureLoadCpu<
  T extends WgslStorageTexture<'2d'>,
>(
  texture: T,
  coords: v2i | v2u,
): TexelFormatToInstanceType<T['format']>;
function textureLoadCpu<
  T extends WgslStorageTexture<'2d-array'>,
>(
  texture: T,
  coords: v2i | v2u,
  arrayIndex: number,
): TexelFormatToInstanceType<T['format']>;
function textureLoadCpu<
  T extends WgslStorageTexture<'3d'>,
>(
  texture: T,
  coords: v3i | v3u,
): TexelFormatToInstanceType<T['format']>;
function textureLoadCpu(
  _texture: WgslSampledTexture | WgslStorageTexture,
  _coords: number | v2i | v2u | v3i | v3u,
  _levelOrArrayIndex?: number,
): TexelData {
  throw new Error(
    '`textureLoad` relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureLoad = dualImpl({
  name: 'textureLoad',
  normalImpl: textureLoadCpu,
  codegenImpl: (...args) => stitch`textureLoad(${args})`,
  signature: (...args) => {
    const texture = args[0] as WgslSampledTexture | WgslStorageTexture;
    if (isWgslSampledTexture(texture)) {
      const sampleType = texture.sampleType;
      return {
        argTypes: args,
        returnType: sampleTypeToReturnType[sampleType],
      };
    }
    const format = texture.format;
    const dataType = texelFormatToDataType[format];
    return {
      argTypes: args,
      returnType: dataType,
    };
  },
});

function textureStoreCpu<
  T extends WgslStorageTexture<'1d'>,
>(
  texture: T,
  coords: number,
  value: typeof texelFormatToDataType[T['format']][typeof $repr],
): void;
function textureStoreCpu<
  T extends WgslStorageTexture<'2d'>,
>(
  texture: T,
  coords: v2i | v2u,
  value: typeof texelFormatToDataType[T['format']][typeof $repr],
): void;
function textureStoreCpu<
  T extends WgslStorageTexture<'2d-array'>,
>(
  texture: T,
  coords: v2i | v2u,
  arrayIndex: number,
  value: typeof texelFormatToDataType[T['format']][typeof $repr],
): void;
function textureStoreCpu<
  T extends WgslStorageTexture<'3d'>,
>(
  texture: T,
  coords: v3i | v3u,
  value: typeof texelFormatToDataType[T['format']][typeof $repr],
): void;
function textureStoreCpu(
  _texture: WgslStorageTexture,
  _coords: number | v2i | v2u | v3i | v3u,
  _arrayIndexOrValue?: number | TexelData,
  _maybeValue?: TexelData,
): void {
  throw new Error(
    '`textureStore` relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureStore = dualImpl({
  name: 'textureStore',
  normalImpl: textureStoreCpu,
  codegenImpl: (...args) => stitch`textureStore(${args})`,
  signature: (...args) => ({ argTypes: args, returnType: Void }),
});

function textureDimensionsCpu<
  T extends WgslSampledTexture<'1d'> | WgslStorageTexture<'1d'>,
>(texture: T): number;
function textureDimensionsCpu<
  T extends WgslSampledTexture<'1d'>,
>(texture: T, level: number): number;
function textureDimensionsCpu<
  T extends
    | WgslSampledTexture<'2d'>
    | WgslSampledTexture<'2d-array'>
    | WgslSampledTexture<'cube'>
    | WgslSampledTexture<'cube-array'>
    | WgslStorageTexture<'2d'>
    | WgslStorageTexture<'2d-array'>
    | WgslExternalTexture,
>(texture: T): v2u;
function textureDimensionsCpu<
  T extends
    | WgslSampledTexture<'2d'>
    | WgslSampledTexture<'2d-array'>
    | WgslSampledTexture<'cube'>
    | WgslSampledTexture<'cube-array'>,
>(texture: T, level: number): v2u;
function textureDimensionsCpu<
  T extends WgslSampledTexture<'3d'> | WgslStorageTexture<'3d'>,
>(texture: T): v3u;
function textureDimensionsCpu<
  T extends WgslSampledTexture<'3d'>,
>(texture: T, level: number): v3u;
function textureDimensionsCpu(
  _texture: WgslSampledTexture | WgslStorageTexture | WgslExternalTexture,
  _level?: number,
): number | v2u | v3u {
  throw new Error(
    '`textureDimensions` relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureDimensions = dualImpl({
  name: 'textureDimensions',
  normalImpl: textureDimensionsCpu,
  codegenImpl: (...args) => stitch`textureDimensions(${args})`,
  signature: (...args) => {
    const dim =
      (args[0] as WgslSampledTexture | WgslStorageTexture | WgslExternalTexture)
        .dimension;
    if (dim === '1d') {
      return {
        argTypes: args,
        returnType: u32,
      };
    }
    if (dim === '3d') {
      return {
        argTypes: args,
        returnType: vec3u,
      };
    }
    return {
      argTypes: args,
      returnType: vec2u,
    };
  },
});

function textureSampleCompareCpu<T extends WgslSampledTexture<'2d', 'depth'>>(
  texture: T,
  sampler: TgpuComparisonSampler,
  coords: v2f,
  depthRef: number,
): number;
function textureSampleCompareCpu<
  T extends WgslSampledTexture<'2d', 'depth'>,
>(
  texture: T,
  sampler: TgpuComparisonSampler,
  coords: v2f,
  depthRef: number,
  offset: v2i,
): number;
function textureSampleCompareCpu<
  T extends WgslSampledTexture<'2d-array', 'depth'>,
>(
  texture: T,
  sampler: TgpuComparisonSampler,
  coords: v2f,
  arrayIndex: number,
  depthRef: number,
): number;
function textureSampleCompareCpu<
  T extends WgslSampledTexture<'2d-array', 'depth'>,
>(
  texture: T,
  sampler: TgpuComparisonSampler,
  coords: v2f,
  arrayIndex: number,
  depthRef: number,
  offset: v2i,
): number;
function textureSampleCompareCpu<T extends WgslSampledTexture<'cube', 'depth'>>(
  texture: T,
  sampler: TgpuComparisonSampler,
  coords: v3f,
  depthRef: number,
): number;
function textureSampleCompareCpu<
  T extends WgslSampledTexture<'cube-array', 'depth'>,
>(
  texture: T,
  sampler: TgpuComparisonSampler,
  coords: v3f,
  arrayIndex: number,
  depthRef: number,
): number;
function textureSampleCompareCpu(
  _texture: WgslSampledTexture,
  _sampler: TgpuComparisonSampler,
  _coords: v2f | v3f,
  _depthRefOrArrayIndex: number,
  _depthRefOrOffset?: number | v2i,
  _maybeOffset?: v2i,
): number {
  throw new Error(
    'Texture comparison sampling relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSampleCompare = dualImpl({
  name: 'textureSampleCompare',
  normalImpl: textureSampleCompareCpu,
  codegenImpl: (...args) => stitch`textureSampleCompare(${args})`,
  signature: (...args) => ({
    argTypes: args,
    returnType: f32,
  }),
});

export const textureSampleBaseClampToEdge = dualImpl({
  name: 'textureSampleBaseClampToEdge',
  normalImpl: (
    _texture: WgslSampledTexture<'2d', 'float'> | WgslExternalTexture,
    _sampler: TgpuSampler,
    _coords: v2f,
  ) => {
    throw new Error(
      'Texture sampling with base clamp to edge is not supported outside of GPU mode.',
    );
  },
  codegenImpl: (...args) => stitch`textureSampleBaseClampToEdge(${args})`,
  signature: (...args) => ({
    argTypes: args,
    returnType: vec4f,
  }),
});
