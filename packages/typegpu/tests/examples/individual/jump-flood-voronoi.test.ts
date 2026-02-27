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
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(0) var writeView: texture_storage_2d_array<rgba16float, write>;

      @group(0) @binding(1) var<uniform> timeUniform: f32;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(0) @binding(2) var<uniform> seedThresholdUniform: f32;

      const palette: array<vec3f, 4> = array<vec3f, 4>(vec3f(0.9215686321258545, 0.8117647171020508, 1), vec3f(0.7176470756530762, 0.545098066329956, 0.9803921580314636), vec3f(0.545098066329956, 0.3607843220233917, 0.9647058844566345), vec3f(0.4274509847164154, 0.2666666805744171, 0.9490196108818054));

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var size = textureDimensions(writeView);
        randSeed2(((vec2f(f32(x), f32(y)) / vec2f(size)) + timeUniform));
        let randomVal = randFloat01();
        let isSeed = (randomVal >= seedThresholdUniform);
        let paletteColor = palette[u32(floor((randFloat01() * 4f)))];
        var variation = (vec3f((randFloat01() - 0.5f), (randFloat01() - 0.5f), (randFloat01() - 0.5f)) * 0.15f);
        var color = select(vec4f(), vec4f(saturate((paletteColor + variation)), 1f), isSeed);
        var coord = select(vec2f(-1), (vec2f(f32(x), f32(y)) / vec2f(size)), isSeed);
        textureStore(writeView, vec2i(i32(x), i32(y)), 0, color);
        textureStore(writeView, vec2i(i32(x), i32(y)), 1, vec4f(coord, 0f, 0f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var floodTexture: texture_2d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      struct voronoiFrag_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn voronoiFrag(_arg_0: voronoiFrag_Input) -> @location(0) vec4f {
        return textureSample(floodTexture, sampler_1, _arg_0.uv);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> offsetUniform: i32;

      @group(1) @binding(1) var readView: texture_storage_2d_array<rgba16float, read>;

      struct SampleResult {
        color: vec4f,
        coord: vec2f,
      }

      fn sampleWithOffset(tex: texture_storage_2d_array<rgba16float, read>, pos: vec2i, offset: vec2i) -> SampleResult {
        var dims = textureDimensions(tex);
        var samplePos = (pos + offset);
        let outOfBounds = ((((samplePos.x < 0i) || (samplePos.y < 0i)) || (samplePos.x >= i32(dims.x))) || (samplePos.y >= i32(dims.y)));
        var safePos = clamp(samplePos, vec2i(), vec2i((dims - 1u)));
        var loadedColor = textureLoad(tex, safePos, 0);
        var loadedCoord = textureLoad(tex, safePos, 1).xy;
        return SampleResult(select(loadedColor, vec4f(), outOfBounds), select(loadedCoord, vec2f(-1), outOfBounds));
      }

      @group(1) @binding(0) var writeView: texture_storage_2d_array<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let offset = offsetUniform;
        var size = textureDimensions(readView);
        var minDist = 1e+20;
        var bestSample = SampleResult(vec4f(), vec2f(-1));
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((-1i * offset), (-1i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
          // unrolled iteration #1
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((0i * offset), (-1i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
          // unrolled iteration #2
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((1i * offset), (-1i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((-1i * offset), (0i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
          // unrolled iteration #1
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((0i * offset), (0i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
          // unrolled iteration #2
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((1i * offset), (0i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
        }
        // unrolled iteration #2
        {
          // unrolled iteration #0
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((-1i * offset), (1i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
          // unrolled iteration #1
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((0i * offset), (1i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
          // unrolled iteration #2
          {
            var sample = sampleWithOffset(readView, vec2i(i32(x), i32(y)), vec2i((1i * offset), (1i * offset)));
            if ((sample.coord.x >= 0f)) {
              let dist = distance(vec2f(f32(x), f32(y)), (sample.coord * vec2f(size)));
              if ((dist < minDist)) {
                minDist = dist;
                bestSample = sample;
              }
            }
          }
        }
        textureStore(writeView, vec2i(i32(x), i32(y)), 0, bestSample.color);
        textureStore(writeView, vec2i(i32(x), i32(y)), 1, vec4f(bestSample.coord, 0f, 0f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
