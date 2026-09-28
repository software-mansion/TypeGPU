import { describe, expect, expectTypeOf } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { d, tgpu } from 'typegpu';
import {
  textureGatherCompare,
  textureNumLayers,
  textureNumLevels,
  textureNumSamples,
} from 'typegpu/std';

describe('texture query and gather-compare builtins', () => {
  it('emits texture count queries for every supported texture category', () => {
    const layout = tgpu.bindGroupLayout({
      sampledArray: { texture: d.texture2dArray() },
      cubeArray: { texture: d.textureCubeArray() },
      depthArray: { texture: d.textureDepth2dArray() },
      depthCubeArray: { texture: d.textureDepthCubeArray() },
      storageArray: { storageTexture: d.textureStorage2dArray('rgba32float', 'read-only') },
      sampled1d: { texture: d.texture1d() },
      sampled3d: { texture: d.texture3d() },
      depthCube: { texture: d.textureDepthCube() },
      multisampled: { texture: d.textureMultisampled2d() },
      depthMultisampled: { texture: d.textureDepthMultisampled2d() },
    });

    const testFn = tgpu.fn([])(() => {
      const sampledLayers = textureNumLayers(layout.$.sampledArray);
      const cubeLayers = textureNumLayers(layout.$.cubeArray);
      const depthLayers = textureNumLayers(layout.$.depthArray);
      const depthCubeLayers = textureNumLayers(layout.$.depthCubeArray);
      const storageLayers = textureNumLayers(layout.$.storageArray);
      const levels1d = textureNumLevels(layout.$.sampled1d);
      const levels3d = textureNumLevels(layout.$.sampled3d);
      const depthLevels = textureNumLevels(layout.$.depthCube);
      const samples = textureNumSamples(layout.$.multisampled);
      const depthSamples = textureNumSamples(layout.$.depthMultisampled);

      if (false) {
        expectTypeOf(sampledLayers).toEqualTypeOf<number>();
        expectTypeOf(cubeLayers).toEqualTypeOf<number>();
        expectTypeOf(depthLayers).toEqualTypeOf<number>();
        expectTypeOf(depthCubeLayers).toEqualTypeOf<number>();
        expectTypeOf(storageLayers).toEqualTypeOf<number>();
        expectTypeOf(levels1d).toEqualTypeOf<number>();
        expectTypeOf(levels3d).toEqualTypeOf<number>();
        expectTypeOf(depthLevels).toEqualTypeOf<number>();
        expectTypeOf(samples).toEqualTypeOf<number>();
        expectTypeOf(depthSamples).toEqualTypeOf<number>();
      }
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var sampledArray: texture_2d_array<f32>;

      @group(0) @binding(1) var cubeArray: texture_cube_array<f32>;

      @group(0) @binding(2) var depthArray: texture_depth_2d_array;

      @group(0) @binding(3) var depthCubeArray: texture_depth_cube_array;

      @group(0) @binding(4) var storageArray: texture_storage_2d_array<rgba32float, read>;

      @group(0) @binding(5) var sampled1d: texture_1d<f32>;

      @group(0) @binding(6) var sampled3d: texture_3d<f32>;

      @group(0) @binding(7) var depthCube: texture_depth_cube;

      @group(0) @binding(8) var multisampled: texture_multisampled_2d<f32>;

      @group(0) @binding(9) var depthMultisampled: texture_depth_multisampled_2d;

      fn testFn() {
        let sampledLayers = textureNumLayers(sampledArray);
        let cubeLayers = textureNumLayers(cubeArray);
        let depthLayers = textureNumLayers(depthArray);
        let depthCubeLayers = textureNumLayers(depthCubeArray);
        let storageLayers = textureNumLayers(storageArray);
        let levels1d = textureNumLevels(sampled1d);
        let levels3d = textureNumLevels(sampled3d);
        let depthLevels = textureNumLevels(depthCube);
        let samples = textureNumSamples(multisampled);
        let depthSamples = textureNumSamples(depthMultisampled);
      }"
    `);
  });

  it('emits all textureGatherCompare overload shapes', () => {
    const layout = tgpu.bindGroupLayout({
      depth2d: { texture: d.textureDepth2d() },
      depth2dArray: { texture: d.textureDepth2dArray() },
      depthCube: { texture: d.textureDepthCube() },
      depthCubeArray: { texture: d.textureDepthCubeArray() },
      comparisonSampler: { sampler: 'comparison' },
    });

    const testFn = tgpu.fn([])(() => {
      const coords2d = d.vec2f(0.5);
      const coords3d = d.vec3f(0.5);
      const arrayIndex = d.f32(1.2);

      const depth2d = textureGatherCompare(
        layout.$.depth2d,
        layout.$.comparisonSampler,
        coords2d,
        0.5,
      );
      const depth2dOffset = textureGatherCompare(
        layout.$.depth2d,
        layout.$.comparisonSampler,
        coords2d,
        0.5,
        d.vec2i(1, -1),
      );
      const depth2dArray = textureGatherCompare(
        layout.$.depth2dArray,
        layout.$.comparisonSampler,
        coords2d,
        arrayIndex,
        0.5,
        d.vec2i(1, -1),
      );
      const depthCube = textureGatherCompare(
        layout.$.depthCube,
        layout.$.comparisonSampler,
        coords3d,
        0.5,
      );
      const depthCubeArray = textureGatherCompare(
        layout.$.depthCubeArray,
        layout.$.comparisonSampler,
        coords3d,
        arrayIndex,
        0.5,
      );

      if (false) {
        expectTypeOf(depth2d).toEqualTypeOf<d.v4f>();
        expectTypeOf(depth2dOffset).toEqualTypeOf<d.v4f>();
        expectTypeOf(depth2dArray).toEqualTypeOf<d.v4f>();
        expectTypeOf(depthCube).toEqualTypeOf<d.v4f>();
        expectTypeOf(depthCubeArray).toEqualTypeOf<d.v4f>();
      }
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var depth2d: texture_depth_2d;

      @group(0) @binding(4) var comparisonSampler: sampler_comparison;

      @group(0) @binding(1) var depth2dArray: texture_depth_2d_array;

      @group(0) @binding(2) var depthCube: texture_depth_cube;

      @group(0) @binding(3) var depthCubeArray: texture_depth_cube_array;

      fn testFn() {
        let coords2d = vec2f(0.5);
        let coords3d = vec3f(0.5);
        const arrayIndex = 1.2000000476837158f;
        let depth2d_1 = textureGatherCompare(depth2d, comparisonSampler, coords2d, 0.5);
        let depth2dOffset = textureGatherCompare(depth2d, comparisonSampler, coords2d, 0.5, vec2i(1, -1));
        let depth2dArray_1 = textureGatherCompare(depth2dArray, comparisonSampler, coords2d, u32(arrayIndex), 0.5, vec2i(1, -1));
        let depthCube_1 = textureGatherCompare(depthCube, comparisonSampler, coords3d, 0.5);
        let depthCubeArray_1 = textureGatherCompare(depthCubeArray, comparisonSampler, coords3d, u32(arrayIndex), 0.5);
      }"
    `);
  });
});
