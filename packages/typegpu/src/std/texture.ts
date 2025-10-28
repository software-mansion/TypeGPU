import { stitch } from '../core/resolve/stitch.ts';
import {
  isWgslTexture,
  type WgslExternalTexture,
  type WgslStorageTexture,
  type WgslTexture,
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
  type TextureFormats,
  textureFormats,
} from '../core/texture/textureFormats.ts';
import type { $internal, $repr } from '../shared/symbols.ts';
import type {
  texture1d,
  texture2d,
  texture2dArray,
  texture3d,
  textureCube,
  textureCubeArray,
  textureDepth2d,
  textureDepth2dArray,
  textureDepthCube,
  textureExternal,
  textureMultisampled2d,
  textureStorage1d,
  textureStorage2d,
  textureStorage2dArray,
  textureStorage3d,
} from '../data/texture.ts';

import type { AnyData } from '../data/dataTypes.ts';
import type { comparisonSampler, sampler } from '../data/sampler.ts';

function sampleCpu<T extends texture1d>(
  texture: T,
  sampler: sampler,
  coords: number,
): v4f;
function sampleCpu<T extends texture2d>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  offset?: v2i,
): v4f;
function sampleCpu<T extends texture2dArray>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  offset?: v2i,
): v4f;
function sampleCpu<T extends texture3d | textureCube>(
  texture: T,
  sampler: sampler,
  coords: v3f,
): v4f;
function sampleCpu<T extends texture3d>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  offset: v3i,
): v4f;
function sampleCpu<T extends textureCubeArray>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  arrayIndex: number,
): v4f;
function sampleCpu<T extends textureDepth2d>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  offset?: v2i,
): number;
function sampleCpu<T extends textureDepth2dArray>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  offset?: v2i,
): number;
function sampleCpu<T extends textureDepthCube>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  arrayIndex?: number,
): number;
function sampleCpu(
  _texture: WgslTexture,
  _sampler: sampler,
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
    const isDepth = (args[0] as WgslTexture).type.startsWith('texture_depth');
    return {
      argTypes: args as AnyData[],
      returnType: isDepth ? f32 : vec4f,
    };
  },
});

function sampleBiasCpu<T extends texture1d>(
  texture: T,
  sampler: sampler,
  coords: number,
  bias: number,
): v4f;
function sampleBiasCpu<T extends texture2d>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  bias: number,
  offset?: v2i,
): v4f;
function sampleBiasCpu<T extends texture2dArray>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  bias: number,
  offset?: v2i,
): v4f;
function sampleBiasCpu<T extends texture3d | textureCube>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  bias: number,
  offset?: v3i,
): v4f;
function sampleBiasCpu<T extends textureCubeArray>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  arrayIndex: number,
  bias: number,
): v4f;
function sampleBiasCpu(
  _texture: WgslTexture,
  _sampler: sampler,
  _coords: number | v2f | v3f,
  _biasOrArrayIndex: number,
  _biasOrOffset?: number | v2i | v3i,
  _maybeOffset?: v2i | v3i,
): v4f {
  throw new Error(
    'Texture sampling with bias relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSampleBias = dualImpl({
  name: 'textureSampleBias',
  normalImpl: sampleBiasCpu,
  codegenImpl: (...args) => stitch`textureSampleBias(${args})`,
  signature: (...args) => ({
    argTypes: args as AnyData[],
    returnType: vec4f,
  }),
});

function sampleLevelCpu<T extends texture1d>(
  texture: T,
  sampler: sampler,
  coords: number,
  level: number,
): v4f;
function sampleLevelCpu<T extends texture2d>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  level: number,
): v4f;
function sampleLevelCpu<T extends texture2d>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  level: number,
  offset: v2i,
): v4f;
function sampleLevelCpu<T extends texture2dArray>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
): v4f;
function sampleLevelCpu<T extends texture2dArray>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
  offset: v2i,
): v4f;
function sampleLevelCpu<T extends texture3d | textureCube>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  level: number,
): v4f;
function sampleLevelCpu<T extends texture3d>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  level: number,
  offset: v3i,
): v4f;
function sampleLevelCpu<T extends textureCubeArray>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  arrayIndex: number,
  level: number,
): v4f;
function sampleLevelCpu<T extends textureDepth2d>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  level: number,
): number;
function sampleLevelCpu<T extends textureDepth2d>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  level: number,
  offset: v2i,
): number;
function sampleLevelCpu<T extends textureDepth2dArray>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
): number;
function sampleLevelCpu<T extends textureDepth2dArray>(
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  level: number,
  offset: v2i,
): number;
function sampleLevelCpu<T extends textureDepthCube>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  level: number,
): number;
function sampleLevelCpu<T extends textureCubeArray>(
  texture: T,
  sampler: sampler,
  coords: v3f,
  arrayIndex: number,
  level: number,
): number;
function sampleLevelCpu(
  _texture: WgslTexture,
  _sampler: sampler,
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
    const isDepth = (args[0] as WgslTexture).type.startsWith('texture_depth');
    return {
      argTypes: args,
      returnType: isDepth ? f32 : vec4f,
    };
  },
});

type PrimitiveToLoadedType = {
  f32: v4f;
  i32: v4i;
  u32: v4u;
};

type TexelFormatToInstanceType<T extends StorageTextureFormats> =
  TextureFormats[T]['vectorType'][typeof $repr];

function textureLoadCpu<T extends texture1d>(
  texture: T,
  coords: number,
  level: number,
): PrimitiveToLoadedType[T[typeof $internal]['type']];
function textureLoadCpu<T extends texture2d>(
  texture: T,
  coords: v2i | v2u,
  level: number,
): PrimitiveToLoadedType[T[typeof $internal]['type']];
function textureLoadCpu<T extends texture2dArray>(
  texture: T,
  coords: v2i | v2u,
  arrayIndex: number,
  level: number,
): PrimitiveToLoadedType[T[typeof $internal]['type']];
function textureLoadCpu<T extends texture3d>(
  texture: T,
  coords: v3i | v3u,
  level: number,
): PrimitiveToLoadedType[T[typeof $internal]['type']];
function textureLoadCpu<T extends textureMultisampled2d>(
  texture: T,
  coords: v2i | v2u,
  sampleIndex: number,
): PrimitiveToLoadedType[T[typeof $internal]['type']];
function textureLoadCpu<T extends textureStorage1d>(
  texture: T,
  coords: number,
): TexelFormatToInstanceType<T[typeof $internal][0]>;
function textureLoadCpu<T extends textureStorage2d>(
  texture: T,
  coords: v2i | v2u,
): TexelFormatToInstanceType<T[typeof $internal][0]>;
function textureLoadCpu<T extends textureStorage2dArray>(
  texture: T,
  coords: v2i | v2u,
  arrayIndex: number,
): TexelFormatToInstanceType<T[typeof $internal][0]>;
function textureLoadCpu<T extends textureStorage3d>(
  texture: T,
  coords: v3i | v3u,
): TexelFormatToInstanceType<T[typeof $internal][0]>;
function textureLoadCpu(
  _texture: WgslTexture | WgslStorageTexture,
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
    const texture = args[0] as WgslTexture | WgslStorageTexture;
    if (isWgslTexture(texture)) {
      const isDepth = texture.type.startsWith('texture_depth');
      const sampleType = texture.sampleType;
      return {
        argTypes: args,
        returnType: isDepth
          ? f32
          : sampleType.type === 'f32'
          ? vec4f
          : sampleType.type === 'u32'
          ? vec4u
          : vec4i,
      };
    }
    const format = texture.format;
    const dataType = textureFormats[format].vectorType;
    return {
      argTypes: args,
      returnType: dataType,
    };
  },
});

function textureStoreCpu<T extends textureStorage1d>(
  texture: T,
  coords: number,
  value: TexelFormatToInstanceType<T[typeof $internal][0]>,
): void;
function textureStoreCpu<T extends textureStorage2d>(
  texture: T,
  coords: v2i | v2u,
  value: TexelFormatToInstanceType<T[typeof $internal][0]>,
): void;
function textureStoreCpu<T extends textureStorage2dArray>(
  texture: T,
  coords: v2i | v2u,
  arrayIndex: number,
  value: TexelFormatToInstanceType<T[typeof $internal][0]>,
): void;
function textureStoreCpu<T extends textureStorage3d>(
  texture: T,
  coords: v3i | v3u,
  value: TexelFormatToInstanceType<T[typeof $internal][0]>,
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

function textureDimensionsCpu<T extends texture1d | textureStorage1d>(
  texture: T,
): number;
function textureDimensionsCpu<T extends texture1d>(
  texture: T,
  level: number,
): number;
function textureDimensionsCpu<
  T extends
    | texture2d
    | texture2dArray
    | textureCube
    | textureCubeArray
    | textureStorage2d
    | textureStorage2dArray
    | textureExternal,
>(texture: T): v2u;
function textureDimensionsCpu<
  T extends
    | texture2d
    | texture2dArray
    | textureCube
    | textureCubeArray,
>(texture: T, level: number): v2u;
function textureDimensionsCpu<T extends texture3d | textureStorage3d>(
  texture: T,
): v3u;
function textureDimensionsCpu<T extends texture3d>(
  texture: T,
  level: number,
): v3u;
function textureDimensionsCpu(
  _texture: WgslTexture | WgslStorageTexture | WgslExternalTexture,
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
    const dim = (
      args[0] as WgslTexture | WgslStorageTexture | WgslExternalTexture
    ).dimension;
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

function textureSampleCompareCpu<T extends textureDepth2d>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  depthRef: number,
): number;
function textureSampleCompareCpu<T extends textureDepth2d>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  depthRef: number,
  offset: v2i,
): number;
function textureSampleCompareCpu<T extends textureDepth2dArray>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  arrayIndex: number,
  depthRef: number,
): number;
function textureSampleCompareCpu<T extends textureDepth2dArray>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  arrayIndex: number,
  depthRef: number,
  offset: v2i,
): number;
function textureSampleCompareCpu<T extends textureDepthCube>(
  texture: T,
  sampler: comparisonSampler,
  coords: v3f,
  depthRef: number,
): number;
function textureSampleCompareCpu<T extends textureCubeArray>(
  texture: T,
  sampler: comparisonSampler,
  coords: v3f,
  arrayIndex: number,
  depthRef: number,
): number;
function textureSampleCompareCpu(
  _texture: WgslTexture,
  _sampler: comparisonSampler,
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

function textureSampleBaseClampToEdgeCpu<
  T extends texture2d | textureExternal,
>(texture: T, sampler: sampler, coords: v2f): v4f {
  throw new Error(
    'Texture sampling with base clamp to edge is not supported outside of GPU mode.',
  );
}

export const textureSampleBaseClampToEdge = dualImpl({
  name: 'textureSampleBaseClampToEdge',
  normalImpl: textureSampleBaseClampToEdgeCpu,
  codegenImpl: (...args) => stitch`textureSampleBaseClampToEdge(${args})`,
  signature: (...args) => ({
    argTypes: args,
    returnType: vec4f,
  }),
});
