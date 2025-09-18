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
      "struct advectFn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var src_2: texture_2d<f32>;

      @group(0) @binding(1) var dst_3: texture_storage_2d<rgba16float, write>;

      struct ShaderParams_5 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams_4: ShaderParams_5;

      @group(0) @binding(3) var linSampler_6: sampler;

      @compute @workgroup_size(16, 16) fn advectFn_0(input: advectFn_Input_1) {
        var texSize = textureDimensions(src_2);
        var pixelPos = input.gid.xy;
        if (((((pixelPos.x >= (texSize.x - 1)) || (pixelPos.y >= (texSize.y - 1))) || (pixelPos.x <= 0)) || (pixelPos.y <= 0))) {
          textureStore(dst_3, pixelPos, vec4f(0, 0, 0, 1));
          return;
        }
        var velocity = textureLoad(src_2, pixelPos, 0);
        var timeStep = simParams_4.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity.xy));
        var clampedPos = clamp(prevPos, vec2f(-0.5), vec2f((vec2f(texSize.xy) - vec2f(0.5))));
        var normalizedPos = ((clampedPos + vec2f(0.5)) / vec2f(texSize.xy));
        var prevVelocity = textureSampleLevel(src_2, linSampler_6, normalizedPos, 0);
        textureStore(dst_3, pixelPos, prevVelocity);
      }

      struct diffusionFn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var in_2: texture_2d<f32>;

      fn getNeighbors_3(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      struct ShaderParams_5 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams_4: ShaderParams_5;

      @group(0) @binding(1) var out_6: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn diffusionFn_0(input: diffusionFn_Input_1) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(in_2));
        var centerVal = textureLoad(in_2, pixelPos, 0);
        var neighbors = getNeighbors_3(pixelPos, texSize);
        var leftVal = textureLoad(in_2, neighbors[0], 0);
        var upVal = textureLoad(in_2, neighbors[1], 0);
        var rightVal = textureLoad(in_2, neighbors[2], 0);
        var downVal = textureLoad(in_2, neighbors[3], 0);
        var timeStep = simParams_4.dt;
        var viscosity = simParams_4.viscosity;
        var diffuseRate = (viscosity * timeStep);
        var blendFactor = (1f / (4 + diffuseRate));
        var diffusedVal = (vec4f(blendFactor) * (((leftVal + rightVal) + (upVal + downVal)) + (diffuseRate * centerVal)));
        textureStore(out_6, pixelPos, diffusedVal);
      }

      struct divergenceFn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var vel_2: texture_2d<f32>;

      fn getNeighbors_3(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var div_4: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn divergenceFn_0(input: divergenceFn_Input_1) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_2));
        var neighbors = getNeighbors_3(pixelPos, texSize);
        var leftVel = textureLoad(vel_2, neighbors[0], 0);
        var upVel = textureLoad(vel_2, neighbors[1], 0);
        var rightVel = textureLoad(vel_2, neighbors[2], 0);
        var downVel = textureLoad(vel_2, neighbors[3], 0);
        var divergence = (0.5 * ((rightVel.x - leftVel.x) + (downVel.y - upVel.y)));
        textureStore(div_4, pixelPos, vec4f(divergence, 0, 0, 1));
      }

      struct pressureFn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var x_2: texture_2d<f32>;

      fn getNeighbors_3(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var b_4: texture_2d<f32>;

      @group(0) @binding(2) var out_5: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn pressureFn_0(input: pressureFn_Input_1) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(x_2));
        var neighbors = getNeighbors_3(pixelPos, texSize);
        var leftPressure = textureLoad(x_2, neighbors[0], 0);
        var upPressure = textureLoad(x_2, neighbors[1], 0);
        var rightPressure = textureLoad(x_2, neighbors[2], 0);
        var downPressure = textureLoad(x_2, neighbors[3], 0);
        var divergence = textureLoad(b_4, pixelPos, 0).x;
        var newPressure = (0.25 * ((((leftPressure.x + rightPressure.x) + upPressure.x) + downPressure.x) - divergence));
        textureStore(out_5, pixelPos, vec4f(newPressure, 0, 0, 1));
      }

      struct projectFn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var vel_2: texture_2d<f32>;

      fn getNeighbors_3(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var p_4: texture_2d<f32>;

      @group(0) @binding(2) var out_5: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn projectFn_0(input: projectFn_Input_1) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_2));
        var velocity = textureLoad(vel_2, pixelPos, 0);
        var neighbors = getNeighbors_3(pixelPos, texSize);
        var leftPressure = textureLoad(p_4, neighbors[0], 0);
        var upPressure = textureLoad(p_4, neighbors[1], 0);
        var rightPressure = textureLoad(p_4, neighbors[2], 0);
        var downPressure = textureLoad(p_4, neighbors[3], 0);
        var pressureGrad = vec2f((0.5 * (rightPressure.x - leftPressure.x)), (0.5 * (downPressure.x - upPressure.x)));
        var projectedVel = (velocity.xy - pressureGrad);
        textureStore(out_5, pixelPos, vec4f(projectedVel, 0, 1));
      }

      struct advectInkFn_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var src_2: texture_2d<f32>;

      @group(0) @binding(0) var vel_3: texture_2d<f32>;

      struct ShaderParams_5 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(3) var<uniform> simParams_4: ShaderParams_5;

      @group(0) @binding(4) var linSampler_6: sampler;

      @group(0) @binding(2) var dst_7: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn advectInkFn_0(input: advectInkFn_Input_1) {
        var texSize = textureDimensions(src_2);
        var pixelPos = input.gid.xy;
        var velocity = textureLoad(vel_3, pixelPos, 0).xy;
        var timeStep = simParams_4.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity));
        var clampedPos = clamp(prevPos, vec2f(-0.5), (vec2f(texSize.xy) - vec2f(0.5)));
        var normalizedPos = ((clampedPos + vec2f(0.5)) / vec2f(texSize.xy));
        var inkVal = textureSampleLevel(src_2, linSampler_6, normalizedPos, 0);
        textureStore(dst_7, pixelPos, inkVal);
      }

      struct renderFn_Input_1 {
        @builtin(vertex_index) idx: u32,
      }

      struct renderFn_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn renderFn_0(input: renderFn_Input_1) -> renderFn_Output_2 {
        var vertices = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        var texCoords = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return renderFn_Output_2(vec4f(vertices[input.idx], 0, 1), texCoords[input.idx]);
      }

      struct fragmentImageFn_Input_4 {
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var result_5: texture_2d<f32>;

      @group(0) @binding(2) var linSampler_6: sampler;

      @group(0) @binding(1) var background_7: texture_2d<f32>;

      @fragment fn fragmentImageFn_3(input: fragmentImageFn_Input_4) -> @location(0) vec4f {
        var pixelStep = 0.001953125f;
        var leftSample = textureSample(result_5, linSampler_6, vec2f((input.uv.x - pixelStep), input.uv.y)).x;
        var rightSample = textureSample(result_5, linSampler_6, vec2f((input.uv.x + pixelStep), input.uv.y)).x;
        var upSample = textureSample(result_5, linSampler_6, vec2f(input.uv.x, (input.uv.y + pixelStep))).x;
        var downSample = textureSample(result_5, linSampler_6, vec2f(input.uv.x, (input.uv.y - pixelStep))).x;
        var gradientX = (rightSample - leftSample);
        var gradientY = (upSample - downSample);
        var distortStrength = 0.8;
        var distortVector = vec2f(gradientX, gradientY);
        var distortedUV = (input.uv + (distortVector * vec2f(distortStrength, -distortStrength)));
        var outputColor = textureSample(background_7, linSampler_6, vec2f(distortedUV.x, (1 - distortedUV.y)));
        return vec4f(outputColor.xyz, 1);
      }"
    `);
  });
});
