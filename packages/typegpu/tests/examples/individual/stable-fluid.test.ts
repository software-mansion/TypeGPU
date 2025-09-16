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
        if (((((pixelPos.x >= (texSize.x - 1)) || (pixelPos.y >= (texSize.y - 1))) || (pixelPos.x <= 0)) || (pixelPos.y <= 0))) {
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

      @group(0) @binding(0) var in_8: texture_2d<f32>;

      fn getNeighbors_9(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      struct ShaderParams_11 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams_10: ShaderParams_11;

      @group(0) @binding(1) var out_12: texture_storage_2d<rgba16float, write>;

      struct diffusionFn_Input_13 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn diffusionFn_7(input: diffusionFn_Input_13) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(in_8));
        var centerVal = textureLoad(in_8, pixelPos, 0);
        var neighbors = getNeighbors_9(pixelPos, texSize);
        var leftVal = textureLoad(in_8, neighbors[0], 0);
        var upVal = textureLoad(in_8, neighbors[1], 0);
        var rightVal = textureLoad(in_8, neighbors[2], 0);
        var downVal = textureLoad(in_8, neighbors[3], 0);
        var timeStep = simParams_10.dt;
        var viscosity = simParams_10.viscosity;
        var diffuseRate = (viscosity * timeStep);
        var blendFactor = (1f / (4 + diffuseRate));
        var diffusedVal = (vec4f(blendFactor) * (((leftVal + rightVal) + (upVal + downVal)) + (diffuseRate * centerVal)));
        textureStore(out_12, pixelPos, diffusedVal);
      }

      @group(0) @binding(0) var vel_15: texture_2d<f32>;

      fn getNeighbors_16(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var div_17: texture_storage_2d<rgba16float, write>;

      struct divergenceFn_Input_18 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn divergenceFn_14(input: divergenceFn_Input_18) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_15));
        var neighbors = getNeighbors_16(pixelPos, texSize);
        var leftVel = textureLoad(vel_15, neighbors[0], 0);
        var upVel = textureLoad(vel_15, neighbors[1], 0);
        var rightVel = textureLoad(vel_15, neighbors[2], 0);
        var downVel = textureLoad(vel_15, neighbors[3], 0);
        var divergence = (0.5 * ((rightVel.x - leftVel.x) + (downVel.y - upVel.y)));
        textureStore(div_17, pixelPos, vec4f(divergence, 0, 0, 1));
      }

      @group(0) @binding(0) var x_20: texture_2d<f32>;

      fn getNeighbors_21(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var b_22: texture_2d<f32>;

      @group(0) @binding(2) var out_23: texture_storage_2d<rgba16float, write>;

      struct pressureFn_Input_24 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn pressureFn_19(input: pressureFn_Input_24) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(x_20));
        var neighbors = getNeighbors_21(pixelPos, texSize);
        var leftPressure = textureLoad(x_20, neighbors[0], 0);
        var upPressure = textureLoad(x_20, neighbors[1], 0);
        var rightPressure = textureLoad(x_20, neighbors[2], 0);
        var downPressure = textureLoad(x_20, neighbors[3], 0);
        var divergence = textureLoad(b_22, pixelPos, 0).x;
        var newPressure = (0.25 * ((((leftPressure.x + rightPressure.x) + upPressure.x) + downPressure.x) - divergence));
        textureStore(out_23, pixelPos, vec4f(newPressure, 0, 0, 1));
      }

      @group(0) @binding(0) var vel_26: texture_2d<f32>;

      fn getNeighbors_27(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var p_28: texture_2d<f32>;

      @group(0) @binding(2) var out_29: texture_storage_2d<rgba16float, write>;

      struct projectFn_Input_30 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn projectFn_25(input: projectFn_Input_30) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_26));
        var velocity = textureLoad(vel_26, pixelPos, 0);
        var neighbors = getNeighbors_27(pixelPos, texSize);
        var leftPressure = textureLoad(p_28, neighbors[0], 0);
        var upPressure = textureLoad(p_28, neighbors[1], 0);
        var rightPressure = textureLoad(p_28, neighbors[2], 0);
        var downPressure = textureLoad(p_28, neighbors[3], 0);
        var pressureGrad = vec2f((0.5 * (rightPressure.x - leftPressure.x)), (0.5 * (downPressure.x - upPressure.x)));
        var projectedVel = (velocity.xy - pressureGrad);
        textureStore(out_29, pixelPos, vec4f(projectedVel, 0, 1));
      }

      @group(0) @binding(1) var src_32: texture_2d<f32>;

      @group(0) @binding(0) var vel_33: texture_2d<f32>;

      struct ShaderParams_35 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(3) var<uniform> simParams_34: ShaderParams_35;

      @group(0) @binding(4) var linSampler_36: sampler;

      @group(0) @binding(2) var dst_37: texture_storage_2d<rgba16float, write>;

      struct advectInkFn_Input_38 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn advectInkFn_31(input: advectInkFn_Input_38) {
        var texSize = textureDimensions(src_32);
        var pixelPos = input.gid.xy;
        var velocity = textureLoad(vel_33, pixelPos, 0).xy;
        var timeStep = simParams_34.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity));
        var clampedPos = clamp(prevPos, vec2f(-0.5), (vec2f(texSize.xy) - vec2f(0.5)));
        var normalizedPos = ((clampedPos + vec2f(0.5)) / vec2f(texSize.xy));
        var inkVal = textureSampleLevel(src_32, linSampler_36, normalizedPos, 0);
        textureStore(dst_37, pixelPos, inkVal);
      }

      struct renderFn_Output_40 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct renderFn_Input_41 {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn renderFn_39(input: renderFn_Input_41) -> renderFn_Output_40 {
        var vertices = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        var texCoords = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return renderFn_Output_40(vec4f(vertices[input.idx], 0, 1), texCoords[input.idx]);
      }

      @group(0) @binding(0) var result_43: texture_2d<f32>;

      @group(0) @binding(2) var linSampler_44: sampler;

      @group(0) @binding(1) var background_45: texture_2d<f32>;

      struct fragmentImageFn_Input_46 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentImageFn_42(input: fragmentImageFn_Input_46) -> @location(0) vec4f {
        var pixelStep = 0.001953125f;
        var leftSample = textureSample(result_43, linSampler_44, vec2f((input.uv.x - pixelStep), input.uv.y)).x;
        var rightSample = textureSample(result_43, linSampler_44, vec2f((input.uv.x + pixelStep), input.uv.y)).x;
        var upSample = textureSample(result_43, linSampler_44, vec2f(input.uv.x, (input.uv.y + pixelStep))).x;
        var downSample = textureSample(result_43, linSampler_44, vec2f(input.uv.x, (input.uv.y - pixelStep))).x;
        var gradientX = (rightSample - leftSample);
        var gradientY = (upSample - downSample);
        var distortStrength = 0.8;
        var distortVector = vec2f(gradientX, gradientY);
        var distortedUV = (input.uv + (distortVector * vec2f(distortStrength, -distortStrength)));
        var outputColor = textureSample(background_45, linSampler_44, vec2f(distortedUV.x, (1 - distortedUV.y)));
        return vec4f(outputColor.xyz, 1);
      }"
    `);
  });
});
