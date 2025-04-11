import type { TgpuSampler } from '../core/sampler/sampler.ts';
import type { TgpuSampledTexture } from '../core/texture/texture.ts';
import { vec4f } from '../data/vector.ts';
import type { v2f, v2i, v3f, v3i, v4f } from '../data/wgslTypes.ts';
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

    return {
      value: `textureSample(${args.map((v) => v.value).join(', ')})`,
      dataType: vec4f,
    };
  },
);
