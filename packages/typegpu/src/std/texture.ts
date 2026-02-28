import { stitch } from '../core/resolve/stitch.ts';
import {
  isWgslTexture,
  type WgslExternalTexture,
  type WgslStorageTexture,
  type WgslTexture,
} from '../data/texture.ts';
import type { TexelData } from '../core/texture/texture.ts';
import { dualImpl, MissingCpuImplError } from '../core/function/dualImpl.ts';
import { f32, i32, u32 } from '../data/numeric.ts';
import { vec2u, vec3u, vec4f, vec4i, vec4u } from '../data/vector.ts';
import {
  type BaseData,
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
  getTextureFormatInfo,
  type StorageTextureFormats,
  type TextureFormats,
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
  textureDepthCubeArray,
  textureExternal,
  textureMultisampled2d,
  textureStorage1d,
  textureStorage2d,
  textureStorage2dArray,
  textureStorage3d,
} from '../data/texture.ts';

import type { comparisonSampler, sampler } from '../data/sampler.ts';

function sampleCpu<T extends texture1d>(texture: T, sampler: sampler, coords: number): v4f;
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
  throw new MissingCpuImplError(
    'Texture sampling relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSample = dualImpl({
  name: 'textureSample',
  normalImpl: sampleCpu,
  codegenImpl: (_ctx, args) => stitch`textureSample(${args})`,
  signature: (...args) => {
    const isDepth = (args[0] as WgslTexture).type.startsWith('texture_depth');
    return {
      argTypes: args as BaseData[],
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
  throw new MissingCpuImplError(
    'Texture sampling with bias relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSampleBias = dualImpl({
  name: 'textureSampleBias',
  normalImpl: sampleBiasCpu,
  codegenImpl: (_ctx, args) => stitch`textureSampleBias(${args})`,
  signature: (...args) => ({
    argTypes: args as BaseData[],
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
  throw new MissingCpuImplError(
    'Texture sampling relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSampleLevel = dualImpl({
  name: 'textureSampleLevel',
  normalImpl: sampleLevelCpu,
  codegenImpl: (_ctx, args) => stitch`textureSampleLevel(${args})`,
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
  throw new MissingCpuImplError(
    '`textureLoad` relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureLoad = dualImpl({
  name: 'textureLoad',
  normalImpl: textureLoadCpu,
  codegenImpl: (_ctx, args) => stitch`textureLoad(${args})`,
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
    const dataType = getTextureFormatInfo(format).vectorType;
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
  throw new MissingCpuImplError(
    '`textureStore` relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureStore = dualImpl({
  name: 'textureStore',
  normalImpl: textureStoreCpu,
  codegenImpl: (_ctx, args) => stitch`textureStore(${args})`,
  signature: (...args) => ({ argTypes: args, returnType: Void }),
});

function textureDimensionsCpu<T extends texture1d | textureStorage1d>(texture: T): number;
function textureDimensionsCpu<T extends texture1d>(texture: T, level: number): number;
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
  T extends texture2d | texture2dArray | textureCube | textureCubeArray,
>(texture: T, level: number): v2u;
function textureDimensionsCpu<T extends texture3d | textureStorage3d>(texture: T): v3u;
function textureDimensionsCpu<T extends texture3d>(texture: T, level: number): v3u;
function textureDimensionsCpu(
  _texture: WgslTexture | WgslStorageTexture | WgslExternalTexture,
  _level?: number,
): number | v2u | v3u {
  throw new MissingCpuImplError(
    '`textureDimensions` relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureDimensions = dualImpl({
  name: 'textureDimensions',
  normalImpl: textureDimensionsCpu,
  codegenImpl: (_ctx, args) => stitch`textureDimensions(${args})`,
  signature: (...args) => {
    const dim = (args[0] as WgslTexture | WgslStorageTexture | WgslExternalTexture).dimension;
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

type Gather2dArgs<T extends texture2d = texture2d> = [
  component: number,
  texture: T,
  sampler: sampler,
  coords: v2f,
  offset?: v2i,
];
type Gather2dArrayArgs<T extends texture2dArray = texture2dArray> = [
  component: number,
  texture: T,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  offset?: v2i,
];
type GatherCubeArgs<T extends textureCube = textureCube> = [
  component: number,
  texture: T,
  sampler: sampler,
  coords: v3f,
];
type GatherCubeArrayArgs<T extends textureCubeArray = textureCubeArray> = [
  component: number,
  texture: T,
  sampler: sampler,
  coords: v3f,
  arrayIndex: number,
];
type GatherDepth2dArgs = [texture: textureDepth2d, sampler: sampler, coords: v2f, offset?: v2i];
type GatherDepth2dArrayArgs = [
  texture: textureDepth2dArray,
  sampler: sampler,
  coords: v2f,
  arrayIndex: number,
  offset?: v2i,
];
type GatherDepthCubeArgs = [texture: textureDepthCube, sampler: sampler, coords: v3f];
type GatherDepthCubeArrayArgs = [
  texture: textureDepthCubeArray,
  sampler: sampler,
  coords: v3f,
  arrayIndex: number,
];

type TextureGatherCpuArgs =
  | Gather2dArgs
  | Gather2dArrayArgs
  | GatherCubeArgs
  | GatherCubeArrayArgs
  | GatherDepth2dArgs
  | GatherDepth2dArrayArgs
  | GatherDepthCubeArgs
  | GatherDepthCubeArrayArgs;

type TextureGatherCpuFn = {
  <T extends texture2d>(
    ...args: Gather2dArgs<T>
  ): PrimitiveToLoadedType[T[typeof $internal]['type']];
  <T extends texture2dArray>(
    ...args: Gather2dArrayArgs<T>
  ): PrimitiveToLoadedType[T[typeof $internal]['type']];
  <T extends textureCube>(
    ...args: GatherCubeArgs<T>
  ): PrimitiveToLoadedType[T[typeof $internal]['type']];
  <T extends textureCubeArray>(
    ...args: GatherCubeArrayArgs<T>
  ): PrimitiveToLoadedType[T[typeof $internal]['type']];
  (...args: GatherDepth2dArgs): v4f;
  (...args: GatherDepth2dArrayArgs): v4f;
  (...args: GatherDepthCubeArgs): v4f;
  (...args: GatherDepthCubeArrayArgs): v4f;
};

export const textureGatherCpu: TextureGatherCpuFn = (..._args: TextureGatherCpuArgs): v4f => {
  throw new Error(
    'Texture gather relies on GPU resources and cannot be executed outside of a draw call',
  );
};

const sampleTypeToVecType = {
  f32: vec4f,
  i32: vec4i,
  u32: vec4u,
};

export const textureGather = dualImpl({
  name: 'textureGather',
  normalImpl: textureGatherCpu,
  codegenImpl: (_ctx, args) => stitch`textureGather(${args})`,
  signature: (...args) => {
    if (args[0].type.startsWith('texture')) {
      const [texture, sampler, coords, _, ...rest] = args;

      const isArrayTexture =
        texture.type === 'texture_depth_2d_array' || texture.type === 'texture_depth_cube_array';

      const argTypes = isArrayTexture
        ? [texture, sampler, coords, [u32, i32], ...rest]
        : (args as BaseData[]);

      return { argTypes: argTypes as BaseData[], returnType: vec4f };
    }

    const [_, texture, sampler, coords, ...rest] = args;

    const isArrayTexture =
      texture.type === 'texture_2d_array' || texture.type === 'texture_cube_array';

    const argTypes = isArrayTexture
      ? [[u32, i32], texture, sampler, coords, [u32, i32], ...rest]
      : [[u32, i32], texture, sampler, coords, ...rest];

    return {
      argTypes: argTypes as BaseData[],
      returnType: sampleTypeToVecType[(texture as WgslTexture).sampleType.type],
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
function textureSampleCompareCpu<T extends textureDepthCubeArray>(
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
  throw new MissingCpuImplError(
    'Texture comparison sampling relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSampleCompare = dualImpl({
  name: 'textureSampleCompare',
  normalImpl: textureSampleCompareCpu,
  codegenImpl: (_ctx, args) => stitch`textureSampleCompare(${args})`,
  signature: (...args) => ({
    argTypes: args,
    returnType: f32,
  }),
});

function textureSampleCompareLevelCpu<T extends textureDepth2d>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  depthRef: number,
): number;
function textureSampleCompareLevelCpu<T extends textureDepth2d>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  depthRef: number,
  offset: v2i,
): number;
function textureSampleCompareLevelCpu<T extends textureDepth2dArray>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  arrayIndex: number,
  depthRef: number,
): number;
function textureSampleCompareLevelCpu<T extends textureDepth2dArray>(
  texture: T,
  sampler: comparisonSampler,
  coords: v2f,
  arrayIndex: number,
  depthRef: number,
  offset: v2i,
): number;
function textureSampleCompareLevelCpu<T extends textureDepthCube>(
  texture: T,
  sampler: comparisonSampler,
  coords: v3f,
  depthRef: number,
): number;
function textureSampleCompareLevelCpu<T extends textureDepthCubeArray>(
  texture: T,
  sampler: comparisonSampler,
  coords: v3f,
  arrayIndex: number,
  depthRef: number,
): number;
function textureSampleCompareLevelCpu(
  _texture: WgslTexture,
  _sampler: comparisonSampler,
  _coords: v2f | v3f,
  _depthRefOrArrayIndex: number,
  _depthRefOrOffset?: number | v2i,
  _maybeOffset?: v2i,
): number {
  throw new MissingCpuImplError(
    'Texture comparison sampling with level relies on GPU resources and cannot be executed outside of a draw call',
  );
}

export const textureSampleCompareLevel = dualImpl({
  name: 'textureSampleCompareLevel',
  normalImpl: textureSampleCompareLevelCpu,
  codegenImpl: (ctx, args) => stitch`textureSampleCompareLevel(${args})`,
  signature: (...args) => ({
    argTypes: args,
    returnType: f32,
  }),
});

function textureSampleBaseClampToEdgeCpu<T extends texture2d | textureExternal>(
  _texture: T,
  _sampler: sampler,
  _coords: v2f,
): v4f {
  throw new MissingCpuImplError(
    'Texture sampling with base clamp to edge is not supported outside of GPU mode.',
  );
}

export const textureSampleBaseClampToEdge = dualImpl({
  name: 'textureSampleBaseClampToEdge',
  normalImpl: textureSampleBaseClampToEdgeCpu,
  codegenImpl: (_ctx, args) => stitch`textureSampleBaseClampToEdge(${args})`,
  signature: (...args) => ({
    argTypes: args,
    returnType: vec4f,
  }),
});
