/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockImageLoading } from '../utils/commonMocks.ts';

describe('stable-fluid example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'stable-fluid',
      setupMocks: mockImageLoading,
      expectedCalls: 7,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var src_1: texture_2d<f32>;

      @group(0) @binding(1) var dst_2: texture_storage_2d<rgba16float, write>;

      struct ShaderParams_4 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams_3: ShaderParams_4;

      @group(0) @binding(3) var linSampler_5: sampler;

      struct advectFn_Input_6 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn advectFn_0(input: advectFn_Input_6) {
        var texSize = textureDimensions(src_1);
        var pixelPos = input.gid.xy;
        if (((((pixelPos.x >= (texSize.x - 1u)) || (pixelPos.y >= (texSize.y - 1u))) || (pixelPos.x <= 0u)) || (pixelPos.y <= 0u))) {
          textureStore(dst_2, pixelPos, vec4f(0, 0, 0, 1));
          return;
        }
        var velocity = textureLoad(src_1, pixelPos, 0);
        var timeStep = simParams_3.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity.xy));
        var clampedPos = clamp(prevPos, vec2f(-0.5), vec2f((vec2f(texSize.xy) - vec2f(0.5))));
        var normalizedPos = ((clampedPos + vec2f(0.5)) / vec2f(texSize.xy));
        var prevVelocity = textureSampleLevel(src_1, linSampler_5, normalizedPos, 0);
        textureStore(dst_2, pixelPos, prevVelocity);
      }

      @group(0) @binding(0) var in_1: texture_2d<f32>;

      fn getNeighbors_2(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0i), vec2i(0i, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      struct ShaderParams_4 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams_3: ShaderParams_4;

      @group(0) @binding(1) var out_5: texture_storage_2d<rgba16float, write>;

      struct diffusionFn_Input_6 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn diffusionFn_0(input: diffusionFn_Input_6) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(in_1));
        var centerVal = textureLoad(in_1, pixelPos, 0);
        var neighbors = getNeighbors_2(pixelPos, texSize);
        var leftVal = textureLoad(in_1, neighbors[0], 0);
        var upVal = textureLoad(in_1, neighbors[1], 0);
        var rightVal = textureLoad(in_1, neighbors[2], 0);
        var downVal = textureLoad(in_1, neighbors[3], 0);
        var timeStep = simParams_3.dt;
        var viscosity = simParams_3.viscosity;
        var diffuseRate = (viscosity * timeStep);
        var blendFactor = (1f / (4f + diffuseRate));
        var diffusedVal = (vec4f(blendFactor) * (((leftVal + rightVal) + (upVal + downVal)) + (diffuseRate * centerVal)));
        textureStore(out_5, pixelPos, diffusedVal);
      }

      @group(0) @binding(0) var vel_1: texture_2d<f32>;

      fn getNeighbors_2(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0i), vec2i(0i, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var div_3: texture_storage_2d<rgba16float, write>;

      struct divergenceFn_Input_4 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn divergenceFn_0(input: divergenceFn_Input_4) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_1));
        var neighbors = getNeighbors_2(pixelPos, texSize);
        var leftVel = textureLoad(vel_1, neighbors[0], 0);
        var upVel = textureLoad(vel_1, neighbors[1], 0);
        var rightVel = textureLoad(vel_1, neighbors[2], 0);
        var downVel = textureLoad(vel_1, neighbors[3], 0);
        var divergence = (0.5f * ((rightVel.x - leftVel.x) + (downVel.y - upVel.y)));
        textureStore(div_3, pixelPos, vec4f(divergence, 0f, 0f, 1f));
      }

      @group(0) @binding(0) var x_1: texture_2d<f32>;

      fn getNeighbors_2(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0i), vec2i(0i, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var b_3: texture_2d<f32>;

      @group(0) @binding(2) var out_4: texture_storage_2d<rgba16float, write>;

      struct pressureFn_Input_5 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn pressureFn_0(input: pressureFn_Input_5) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(x_1));
        var neighbors = getNeighbors_2(pixelPos, texSize);
        var leftPressure = textureLoad(x_1, neighbors[0], 0);
        var upPressure = textureLoad(x_1, neighbors[1], 0);
        var rightPressure = textureLoad(x_1, neighbors[2], 0);
        var downPressure = textureLoad(x_1, neighbors[3], 0);
        var divergence = textureLoad(b_3, pixelPos, 0).x;
        var newPressure = (0.25f * ((((leftPressure.x + rightPressure.x) + upPressure.x) + downPressure.x) - divergence));
        textureStore(out_4, pixelPos, vec4f(newPressure, 0f, 0f, 1f));
      }

      @group(0) @binding(0) var vel_1: texture_2d<f32>;

      fn getNeighbors_2(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0i), vec2i(0i, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var p_3: texture_2d<f32>;

      @group(0) @binding(2) var out_4: texture_storage_2d<rgba16float, write>;

      struct projectFn_Input_5 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn projectFn_0(input: projectFn_Input_5) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_1));
        var velocity = textureLoad(vel_1, pixelPos, 0);
        var neighbors = getNeighbors_2(pixelPos, texSize);
        var leftPressure = textureLoad(p_3, neighbors[0], 0);
        var upPressure = textureLoad(p_3, neighbors[1], 0);
        var rightPressure = textureLoad(p_3, neighbors[2], 0);
        var downPressure = textureLoad(p_3, neighbors[3], 0);
        var pressureGrad = vec2f((0.5f * (rightPressure.x - leftPressure.x)), (0.5f * (downPressure.x - upPressure.x)));
        var projectedVel = (velocity.xy - pressureGrad);
        textureStore(out_4, pixelPos, vec4f(projectedVel, 0f, 1f));
      }

      @group(0) @binding(1) var src_1: texture_2d<f32>;

      @group(0) @binding(0) var vel_2: texture_2d<f32>;

      struct ShaderParams_4 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(3) var<uniform> simParams_3: ShaderParams_4;

      @group(0) @binding(4) var linSampler_5: sampler;

      @group(0) @binding(2) var dst_6: texture_storage_2d<rgba16float, write>;

      struct advectInkFn_Input_7 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn advectInkFn_0(input: advectInkFn_Input_7) {
        var texSize = textureDimensions(src_1);
        var pixelPos = input.gid.xy;
        var velocity = textureLoad(vel_2, pixelPos, 0).xy;
        var timeStep = simParams_3.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity));
        var clampedPos = clamp(prevPos, vec2f(-0.5), (vec2f(texSize.xy) - vec2f(0.5)));
        var normalizedPos = ((clampedPos + vec2f(0.5)) / vec2f(texSize.xy));
        var inkVal = textureSampleLevel(src_1, linSampler_5, normalizedPos, 0);
        textureStore(dst_6, pixelPos, inkVal);
      }

      struct renderFn_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct renderFn_Input_2 {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn renderFn_0(input: renderFn_Input_2) -> renderFn_Output_1 {
        var vertices = array<vec2f, 3>(vec2f(-1, -1), vec2f(3f, -1), vec2f(-1, 3f));
        var texCoords = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return renderFn_Output_1(vec4f(vertices[input.idx], 0f, 1f), texCoords[input.idx]);
      }

      @group(0) @binding(0) var result_4: texture_2d<f32>;

      @group(0) @binding(2) var linSampler_5: sampler;

      @group(0) @binding(1) var background_6: texture_2d<f32>;

      struct fragmentImageFn_Input_7 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentImageFn_3(input: fragmentImageFn_Input_7) -> @location(0) vec4f {
        var pixelStep = 0.001953125f;
        var leftSample = textureSample(result_4, linSampler_5, vec2f((input.uv.x - pixelStep), input.uv.y)).x;
        var rightSample = textureSample(result_4, linSampler_5, vec2f((input.uv.x + pixelStep), input.uv.y)).x;
        var upSample = textureSample(result_4, linSampler_5, vec2f(input.uv.x, (input.uv.y + pixelStep))).x;
        var downSample = textureSample(result_4, linSampler_5, vec2f(input.uv.x, (input.uv.y - pixelStep))).x;
        var gradientX = (rightSample - leftSample);
        var gradientY = (upSample - downSample);
        var distortStrength = 0.8;
        var distortVector = vec2f(gradientX, gradientY);
        var distortedUV = (input.uv + (distortVector * vec2f(distortStrength, -distortStrength)));
        var outputColor = textureSample(background_6, linSampler_5, vec2f(distortedUV.x, (1f - distortedUV.y)));
        return vec4f(outputColor.xyz, 1f);
      }"
    `);
  });
});
