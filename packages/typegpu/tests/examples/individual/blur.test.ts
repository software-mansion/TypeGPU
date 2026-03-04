/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockCreateImageBitmap, mockImageLoading } from '../utils/commonMocks.ts';

describe('blur example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'image-processing',
        name: 'blur',
        setupMocks: () => {
          mockImageLoading();
          mockCreateImageBitmap();
        },
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Settings {
        filterDim: i32,
        blockDim: u32,
      }

      @group(0) @binding(0) var<uniform> settingsUniform: Settings;

      @group(1) @binding(1) var inTexture: texture_2d<f32>;

      @group(1) @binding(0) var<uniform> flip: u32;

      var<workgroup> tileData: array<array<vec3f, 128>, 4>;

      @group(0) @binding(1) var sampler_1: sampler;

      @group(1) @binding(2) var outTexture: texture_storage_2d<rgba8unorm, write>;

      struct computeFn_Input {
        @builtin(workgroup_id) wid: vec3u,
        @builtin(local_invocation_id) lid: vec3u,
      }

      @compute @workgroup_size(32, 1, 1) fn computeFn(_arg_0: computeFn_Input) {
        let settings2 = (&settingsUniform);
        let filterOffset = i32((f32(((*settings2).filterDim - 1i)) / 2f));
        var dims = vec2i(textureDimensions(inTexture));
        var baseIndex = (vec2i(((_arg_0.wid.xy * vec2u((*settings2).blockDim, 4u)) + (_arg_0.lid.xy * vec2u(4, 1)))) - vec2i(filterOffset, 0i));
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            var loadIndex = (baseIndex + vec2i());
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[0i][((_arg_0.lid.x * 4u) + 0u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #1
          {
            var loadIndex = (baseIndex + vec2i(1, 0));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[0i][((_arg_0.lid.x * 4u) + 1u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #2
          {
            var loadIndex = (baseIndex + vec2i(2, 0));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[0i][((_arg_0.lid.x * 4u) + 2u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #3
          {
            var loadIndex = (baseIndex + vec2i(3, 0));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[0i][((_arg_0.lid.x * 4u) + 3u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            var loadIndex = (baseIndex + vec2i(0, 1));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[1i][((_arg_0.lid.x * 4u) + 0u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #1
          {
            var loadIndex = (baseIndex + vec2i(1));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[1i][((_arg_0.lid.x * 4u) + 1u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #2
          {
            var loadIndex = (baseIndex + vec2i(2, 1));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[1i][((_arg_0.lid.x * 4u) + 2u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #3
          {
            var loadIndex = (baseIndex + vec2i(3, 1));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[1i][((_arg_0.lid.x * 4u) + 3u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
        }
        // unrolled iteration #2
        {
          // unrolled iteration #0
          {
            var loadIndex = (baseIndex + vec2i(0, 2));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[2i][((_arg_0.lid.x * 4u) + 0u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #1
          {
            var loadIndex = (baseIndex + vec2i(1, 2));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[2i][((_arg_0.lid.x * 4u) + 1u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #2
          {
            var loadIndex = (baseIndex + vec2i(2));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[2i][((_arg_0.lid.x * 4u) + 2u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #3
          {
            var loadIndex = (baseIndex + vec2i(3, 2));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[2i][((_arg_0.lid.x * 4u) + 3u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
        }
        // unrolled iteration #3
        {
          // unrolled iteration #0
          {
            var loadIndex = (baseIndex + vec2i(0, 3));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[3i][((_arg_0.lid.x * 4u) + 0u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #1
          {
            var loadIndex = (baseIndex + vec2i(1, 3));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[3i][((_arg_0.lid.x * 4u) + 1u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #2
          {
            var loadIndex = (baseIndex + vec2i(2, 3));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[3i][((_arg_0.lid.x * 4u) + 2u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
          // unrolled iteration #3
          {
            var loadIndex = (baseIndex + vec2i(3));
            if ((flip != 0u)) {
              loadIndex = loadIndex.yx;
            }
            tileData[3i][((_arg_0.lid.x * 4u) + 3u)] = textureSampleLevel(inTexture, sampler_1, ((vec2f(loadIndex) + vec2f(0.5)) / vec2f(dims)), 0).rgb;
          }
        }
        workgroupBarrier();
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            var writeIndex = (baseIndex + vec2i());
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 0i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[0i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #1
          {
            var writeIndex = (baseIndex + vec2i(1, 0));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 1i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[0i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #2
          {
            var writeIndex = (baseIndex + vec2i(2, 0));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 2i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[0i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #3
          {
            var writeIndex = (baseIndex + vec2i(3, 0));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 3i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[0i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            var writeIndex = (baseIndex + vec2i(0, 1));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 0i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[1i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #1
          {
            var writeIndex = (baseIndex + vec2i(1));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 1i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[1i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #2
          {
            var writeIndex = (baseIndex + vec2i(2, 1));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 2i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[1i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #3
          {
            var writeIndex = (baseIndex + vec2i(3, 1));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 3i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[1i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
        }
        // unrolled iteration #2
        {
          // unrolled iteration #0
          {
            var writeIndex = (baseIndex + vec2i(0, 2));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 0i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[2i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #1
          {
            var writeIndex = (baseIndex + vec2i(1, 2));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 1i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[2i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #2
          {
            var writeIndex = (baseIndex + vec2i(2));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 2i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[2i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #3
          {
            var writeIndex = (baseIndex + vec2i(3, 2));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 3i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[2i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
        }
        // unrolled iteration #3
        {
          // unrolled iteration #0
          {
            var writeIndex = (baseIndex + vec2i(0, 3));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 0i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[3i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #1
          {
            var writeIndex = (baseIndex + vec2i(1, 3));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 1i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[3i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #2
          {
            var writeIndex = (baseIndex + vec2i(2, 3));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 2i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[3i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
          // unrolled iteration #3
          {
            var writeIndex = (baseIndex + vec2i(3));
            if ((flip != 0u)) {
              writeIndex = writeIndex.yx;
            }
            let center = (i32((4u * _arg_0.lid.x)) + 3i);
            if ((((center >= filterOffset) && (center < (128i - filterOffset))) && all((writeIndex < dims)))) {
              var acc = vec3f();
              for (var f = 0; (f < (*settings2).filterDim); f++) {
                let i = ((center + f) - filterOffset);
                acc = (acc + (tileData[3i][i] * (1f / f32((*settings2).filterDim))));
              }
              textureStore(outTexture, writeIndex, vec4f(acc, 1f));
            }
          }
        }
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

      @group(0) @binding(0) var renderView: texture_2d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      struct renderFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn renderFragment(input: renderFragment_Input) -> @location(0) vec4f {
        return textureSample(renderView, sampler_1, input.uv);
      }"
    `);
  });
});
