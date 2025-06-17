import type { TgpuSampler } from '../core/sampler/sampler.ts';
import type {
  TgpuSampledTexture,
  TgpuStorageTexture,
} from '../core/texture/texture.ts';
import type { ChannelData, TexelData } from '../core/texture/texture.ts';
import { snip } from '../data/dataTypes.ts';
import { u32 } from '../data/numeric.ts';
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
import { createDualImpl } from '../shared/generators.ts';

type TextureSampleOverload = {
  <T extends TgpuSampledTexture<'1d'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: number,
  ): v4f;
  <T extends TgpuSampledTexture<'2d'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v2f,
  ): v4f;
  <T extends TgpuSampledTexture<'2d'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v2f,
    offset: v2i,
  ): v4f;
  <T extends TgpuSampledTexture<'2d-array'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v2f,
    arrayIndex: number,
  ): v4f;
  <T extends TgpuSampledTexture<'2d-array'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v2f,
    arrayIndex: number,
    offset: v2i,
  ): v4f;
  <T extends TgpuSampledTexture<'3d' | 'cube'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v3f,
  ): v4f;
  <T extends TgpuSampledTexture<'3d'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v3f,
    offset: v3i,
  ): v4f;
  <T extends TgpuSampledTexture<'cube-array'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v3f,
    arrayIndex: number,
  ): v4f;
  // TODO: Support this
  // <T extends TgpuSampledTexture<'depth-2d'>>(
  //   texture: T,
  //   sampler: TgpuSampler,
  //   coords: v2f,
  // ): number;
  // <T extends TgpuSampledTexture<'depth-2d'>>(
  //   texture: T,
  //   sampler: TgpuSampler,
  //   coords: v2f,
  //   offset: v2i,
  // ): number;
  // <T extends TgpuSampledTexture<'depth-2d-array'>>(
  //   texture: T,
  //   sampler: TgpuSampler,
  //   coords: v2f,
  //   arrayIndex: number,
  // ): number;
  // <T extends TgpuSampledTexture<'depth-2d-array'>>(
  //   texture: T,
  //   sampler: TgpuSampler,
  //   coords: v2f,
  //   arrayIndex: number,
  //   offset: v2i,
  // ): number;
  // <T extends TgpuSampledTexture<'depth-cube'>>(
  //   texture: T,
  //   sampler: TgpuSampler,
  //   coords: v3i,
  // ): number;
  // <T extends TgpuSampledTexture<'depth-cube-array'>>(
  //   texture: T,
  //   sampler: TgpuSampler,
  //   coords: v3i,
  //   arrayIndex: number,
  // ): number;
};

export const textureSample: TextureSampleOverload = createDualImpl(
  // CPU implementation
  (
    _texture: TgpuSampledTexture,
    _sampler: TgpuSampler,
    _coords: number | v2f | v3f,
    _offsetOrArrayIndex?: v2i | v3i | number,
    _maybeOffset?: v2i | v3i,
  ) => {
    throw new Error('Texture sampling is not supported outside of GPU mode.');
  },
  // GPU implementation
  (texture, sampler, coords, offsetOrArrayIndex, maybeOffset) => {
    const args = [texture, sampler, coords];

    if (offsetOrArrayIndex !== undefined) {
      args.push(offsetOrArrayIndex);
    }

    if (maybeOffset !== undefined) {
      args.push(maybeOffset);
    }

    return snip(`textureSample(${args.map((v) => v.value).join(', ')})`, vec4f);
  },
  'textureSample',
);

type TextureSampleLevelOverload = {
  <T extends TgpuSampledTexture<'2d'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v2f,
    level: number,
    offset?: v2i,
  ): v4f;
  <T extends TgpuSampledTexture<'2d-array'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v2f,
    arrayIndex: number,
    level: number,
    offset?: v2i,
  ): v4f;
  <T extends TgpuSampledTexture<'3d' | 'cube'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v3f,
    level: number,
    offset?: v3i,
  ): v4f;
  <T extends TgpuSampledTexture<'cube-array'>>(
    texture: T,
    sampler: TgpuSampler,
    coords: v3f,
    arrayIndex: number,
    level: number,
  ): v4f;
};

export const textureSampleLevel: TextureSampleLevelOverload = createDualImpl(
  // CPU implementation
  (
    _texture: TgpuSampledTexture,
    _sampler: TgpuSampler,
    _coords: number | v2f | v3f,
    _level: number,
    _offsetOrArrayIndex?: v2i | v3i | number,
  ) => {
    throw new Error('Texture sampling is not supported outside of GPU mode.');
  },
  // GPU implementation
  (texture, sampler, coords, level, offsetOrArrayIndex) => {
    const args = [texture, sampler, coords, level];

    if (offsetOrArrayIndex !== undefined) {
      args.push(offsetOrArrayIndex);
    }

    return snip(
      `textureSampleLevel(${args.map((v) => v.value).join(', ')})`,
      vec4f,
    );
  },
  'textureSampleLevel',
);

type TexelDataToInstance<TF extends TexelData> = {
  vec4f: v4f;
  vec4i: v4i;
  vec4u: v4u;
}[TF['type']];

type SampleTypeToInstance<TF extends ChannelData> = {
  u32: v4u;
  i32: v4i;
  f32: v4f;
}[TF['type']];

const channelDataToInstance = {
  u32: vec4u,
  i32: vec4i,
  f32: vec4f,
};

type TextureLoadOverload = {
  <T extends TgpuStorageTexture<'1d'>>(
    texture: T,
    coords: number,
  ): TexelDataToInstance<T['texelDataType']>;
  <T extends TgpuStorageTexture<'2d'>>(
    texture: T,
    coords: v2i | v2u,
  ): TexelDataToInstance<T['texelDataType']>;
  <T extends TgpuStorageTexture<'2d-array'>>(
    texture: T,
    coords: v2i | v2u,
    arrayIndex: number,
  ): TexelDataToInstance<T['texelDataType']>;
  <T extends TgpuStorageTexture<'3d'>>(
    texture: T,
    coords: v3i | v3u,
  ): TexelDataToInstance<T['texelDataType']>;

  <T extends TgpuSampledTexture<'1d'>>(
    texture: T,
    coords: number,
    level: number,
  ): SampleTypeToInstance<T['channelDataType']>;
  <T extends TgpuSampledTexture<'2d'>>(
    texture: T,
    coords: v2i | v2u,
    level: number,
  ): SampleTypeToInstance<T['channelDataType']>;
  <T extends TgpuSampledTexture<'2d-array'>>(
    texture: T,
    coords: v2i | v2u,
    arrayIndex: number,
    level: number,
  ): SampleTypeToInstance<T['channelDataType']>;
  <T extends TgpuSampledTexture<'3d'>>(
    texture: T,
    coords: v3i | v3u,
    level: number,
  ): SampleTypeToInstance<T['channelDataType']>;
  // TODO: Support multisampled textures and depth textures
};

export const textureLoad: TextureLoadOverload = createDualImpl(
  // CPU implementation
  (
    _texture: TgpuStorageTexture | TgpuSampledTexture,
    _coords: number | v2i | v2u | v3i | v3u,
    _levelOrArrayIndex?: number,
  ) => {
    throw new Error('Texture loading is not supported outside of GPU mode.');
  },
  // GPU implementation
  (texture, coords, levelOrArrayIndex) => {
    const args = [texture, coords];

    if (levelOrArrayIndex !== undefined) {
      args.push(levelOrArrayIndex);
    }

    const textureInfo = texture.dataType as unknown as
      | TgpuStorageTexture
      | TgpuSampledTexture;

    return snip(
      `textureLoad(${args.map((v) => v.value).join(', ')})`,
      'texelDataType' in textureInfo
        ? textureInfo.texelDataType
        : channelDataToInstance[textureInfo.channelDataType.type],
    );
  },
  'textureLoad',
);

type TextureStoreOverload = {
  <T extends TgpuStorageTexture<'1d'>>(
    texture: T,
    coords: number,
    value: TexelDataToInstance<T['texelDataType']>,
  ): void;
  <T extends TgpuStorageTexture<'2d'>>(
    texture: T,
    coords: v2i | v2u,
    value: TexelDataToInstance<T['texelDataType']>,
  ): void;
  <T extends TgpuStorageTexture<'2d-array'>>(
    texture: T,
    coords: v2i | v2u,
    arrayIndex: number,
    value: TexelDataToInstance<T['texelDataType']>,
  ): void;
  <T extends TgpuStorageTexture<'3d'>>(
    texture: T,
    coords: v3i | v3u,
    value: TexelDataToInstance<T['texelDataType']>,
  ): void;
};

export const textureStore: TextureStoreOverload = createDualImpl(
  // CPU implementation
  (
    _texture: TgpuStorageTexture,
    _coords: number | v2i | v2u | v3i | v3u,
    _arrayIndexOrValue?: number | TexelData,
    _maybeValue?: TexelData,
  ) => {
    throw new Error('Texture storing is not supported outside of GPU mode.');
  },
  // GPU implementation
  (texture, coords, arrayIndexOrValue, maybeValue) =>
    snip(
      `textureStore(${
        [texture, coords, arrayIndexOrValue, maybeValue].filter(
          (arg) => arg !== undefined,
        ).map((v) => v.value).join(', ')
      })`,
      Void,
    ),
  'textureStore',
);

type TextureDimensionsOverload = {
  <T extends TgpuSampledTexture<'1d'> | TgpuStorageTexture<'1d'>>(
    texture: T,
  ): number;
  <T extends TgpuSampledTexture<'1d'>>(texture: T, level: number): number;

  <
    T extends
      | TgpuSampledTexture<'2d'>
      | TgpuSampledTexture<'2d-array'>
      | TgpuSampledTexture<'cube'>
      | TgpuSampledTexture<'cube-array'>
      | TgpuStorageTexture<'2d'>
      | TgpuStorageTexture<'2d-array'>,
  >(
    texture: T,
  ): v2u;
  <
    T extends
      | TgpuSampledTexture<'2d'>
      | TgpuSampledTexture<'2d-array'>
      | TgpuSampledTexture<'cube'>
      | TgpuSampledTexture<'cube-array'>,
  >(
    texture: T,
    level: number,
  ): v2u;

  <T extends TgpuSampledTexture<'3d'> | TgpuStorageTexture<'3d'>>(
    texture: T,
  ): v3u;
  <T extends TgpuSampledTexture<'3d'>>(texture: T, level: number): v3u;
};

export const textureDimensions: TextureDimensionsOverload = createDualImpl(
  // CPU implementation
  (_texture: TgpuSampledTexture | TgpuStorageTexture, _level?: number) => {
    throw new Error(
      'Texture dimensions are not supported outside of GPU mode.',
    );
  },
  // GPU implementation
  (texture, level) => {
    const dim =
      (texture.dataType as unknown as TgpuSampledTexture | TgpuStorageTexture)
        .dimension;
    return snip(
      `textureDimensions(${texture.value}${
        level !== undefined ? `, ${level.value}` : ''
      })`,
      dim === '1d' ? u32 : dim === '3d' ? vec3u : vec2u,
    );
  },
  'textureDimensions',
);
