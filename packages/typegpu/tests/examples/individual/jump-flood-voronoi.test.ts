/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('jump flood (voronoi) example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'algorithms',
      name: 'jump-flood-voronoi',
      expectedCalls: 3,
      setupMocks: mockResizeObserver,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(1) @binding(0) var writeView_3: texture_storage_2d_array<rgba16float, write>;

      @group(0) @binding(1) var<uniform> timeUniform_4: f32;

      var<private> seed_7: vec2f;

      fn seed2_6(value: vec2f) {
        seed_7 = value;
      }

      fn randSeed2_5(seed: vec2f) {
        seed2_6(seed);
      }

      fn item_9() -> f32 {
        let a = dot(seed_7, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_7, vec2f(54.47856521606445, 345.8415222167969));
        seed_7.x = fract((cos(a) * 136.8168f));
        seed_7.y = fract((cos(b) * 534.7645f));
        return seed_7.y;
      }

      fn randFloat01_8() -> f32 {
        return item_9();
      }

      @group(0) @binding(2) var<uniform> seedThresholdUniform_10: f32;

      const palette_11: array<vec3f, 4> = array<vec3f, 4>(vec3f(0.9215686321258545, 0.8117647171020508, 1), vec3f(0.7176470756530762, 0.545098066329956, 0.9803921580314636), vec3f(0.545098066329956, 0.3607843220233917, 0.9647058844566345), vec3f(0.4274509847164154, 0.2666666805744171, 0.9490196108818054));

      fn wrappedCallback_2(x: u32, y: u32, _arg_2: u32) {
        var size = textureDimensions(writeView_3);
        randSeed2_5(((vec2f(f32(x), f32(y)) / vec2f(size)) + timeUniform_4));
        let randomVal = randFloat01_8();
        let isSeed = (randomVal >= seedThresholdUniform_10);
        let paletteColor = palette_11[u32(floor((randFloat01_8() * 4f)))];
        var variation = (vec3f((randFloat01_8() - 0.5f), (randFloat01_8() - 0.5f), (randFloat01_8() - 0.5f)) * 0.15);
        var color = select(vec4f(), vec4f(saturate((paletteColor + variation)), 1f), isSeed);
        var coord = select(vec2f(-1), (vec2f(f32(x), f32(y)) / vec2f(size)), isSeed);
        textureStore(writeView_3, vec2i(i32(x), i32(y)), 0, color);
        textureStore(writeView_3, vec2i(i32(x), i32(y)), 1, vec4f(coord, 0f, 0f));
      }

      struct mainCompute_Input_12 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute_0(in: mainCompute_Input_12)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      struct fullScreenTriangle_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle_0(in: fullScreenTriangle_Input_1) -> fullScreenTriangle_Output_2 {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output_2(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var floodTexture_4: texture_2d<f32>;

      @group(0) @binding(1) var sampler_5: sampler;

      struct voronoiFrag_Input_6 {
        @location(0) uv: vec2f,
      }

      @fragment fn voronoiFrag_3(_arg_0: voronoiFrag_Input_6) -> @location(0) vec4f {
        return textureSample(floodTexture_4, sampler_5, _arg_0.uv);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(0) @binding(1) var<uniform> offsetUniform_3: i32;

      @group(1) @binding(1) var readView_4: texture_storage_2d_array<rgba16float, read>;

      struct SampleResult_5 {
        color: vec4f,
        coord: vec2f,
      }

      fn sampleWithOffset_6(tex: texture_storage_2d_array<rgba16float, read>, pos: vec2i, offset: vec2i) -> SampleResult_5 {
        var dims = textureDimensions(tex);
        var samplePos = (pos + offset);
        let outOfBounds = ((((samplePos.x < 0i) || (samplePos.y < 0i)) || (samplePos.x >= i32(dims.x))) || (samplePos.y >= i32(dims.y)));
        var safePos = clamp(samplePos, vec2i(), vec2i((dims - 1)));
        var loadedColor = textureLoad(tex, safePos, 0);
        var loadedCoord = textureLoad(tex, safePos, 1).xy;
        return SampleResult_5(select(loadedColor, vec4f(), outOfBounds), select(loadedCoord, vec2f(-1), outOfBounds));
      }

      @group(1) @binding(0) var writeView_7: texture_storage_2d_array<rgba16float, write>;

      fn wrappedCallback_2(x: u32, y: u32, _arg_2: u32) {
        let offset = offsetUniform_3;
        var size = textureDimensions(readView_4);
        var minDist = 1e+20;
        var bestSample = SampleResult_5(vec4f(), vec2f(-1));
        for (var dy = -1; (dy <= 1i); dy++) {
          for (var dx = -1; (dx <= 1i); dx++) {
            var sample = sampleWithOffset_6(readView_4, vec2i(i32(x), i32(y)), vec2i((dx * offset), (dy * offset)));
            if ((sample.coord.x < 0f)) {
              continue;
            }
            let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
            if ((dist < minDist)) {
              minDist = dist;
              bestSample = sample;
            }
          }
        }
        textureStore(writeView_7, vec2i(i32(x), i32(y)), 0, bestSample.color);
        textureStore(writeView_7, vec2i(i32(x), i32(y)), 1, vec4f(bestSample.coord, 0f, 0f));
      }

      struct mainCompute_Input_8 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute_0(in: mainCompute_Input_8)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
