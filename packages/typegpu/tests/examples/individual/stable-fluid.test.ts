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

      struct diffusionFn_Input_8 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var in_9: texture_2d<f32>;

      fn getNeighbors_10(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      struct ShaderParams_12 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams_11: ShaderParams_12;

      @group(0) @binding(1) var out_13: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn diffusionFn_7(input: diffusionFn_Input_8) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(in_9));
        var centerVal = textureLoad(in_9, pixelPos, 0);
        var neighbors = getNeighbors_10(pixelPos, texSize);
        var leftVal = textureLoad(in_9, neighbors[0], 0);
        var upVal = textureLoad(in_9, neighbors[1], 0);
        var rightVal = textureLoad(in_9, neighbors[2], 0);
        var downVal = textureLoad(in_9, neighbors[3], 0);
        var timeStep = simParams_11.dt;
        var viscosity = simParams_11.viscosity;
        var diffuseRate = (viscosity * timeStep);
        var blendFactor = (1f / (4 + diffuseRate));
        var diffusedVal = (vec4f(blendFactor) * (((leftVal + rightVal) + (upVal + downVal)) + (diffuseRate * centerVal)));
        textureStore(out_13, pixelPos, diffusedVal);
      }

      struct divergenceFn_Input_15 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var vel_16: texture_2d<f32>;

      fn getNeighbors_17(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var div_18: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn divergenceFn_14(input: divergenceFn_Input_15) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_16));
        var neighbors = getNeighbors_17(pixelPos, texSize);
        var leftVel = textureLoad(vel_16, neighbors[0], 0);
        var upVel = textureLoad(vel_16, neighbors[1], 0);
        var rightVel = textureLoad(vel_16, neighbors[2], 0);
        var downVel = textureLoad(vel_16, neighbors[3], 0);
        var divergence = (0.5 * ((rightVel.x - leftVel.x) + (downVel.y - upVel.y)));
        textureStore(div_18, pixelPos, vec4f(divergence, 0, 0, 1));
      }

      struct pressureFn_Input_20 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var x_21: texture_2d<f32>;

      fn getNeighbors_22(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var b_23: texture_2d<f32>;

      @group(0) @binding(2) var out_24: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn pressureFn_19(input: pressureFn_Input_20) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(x_21));
        var neighbors = getNeighbors_22(pixelPos, texSize);
        var leftPressure = textureLoad(x_21, neighbors[0], 0);
        var upPressure = textureLoad(x_21, neighbors[1], 0);
        var rightPressure = textureLoad(x_21, neighbors[2], 0);
        var downPressure = textureLoad(x_21, neighbors[3], 0);
        var divergence = textureLoad(b_23, pixelPos, 0).x;
        var newPressure = (0.25 * ((((leftPressure.x + rightPressure.x) + upPressure.x) + downPressure.x) - divergence));
        textureStore(out_24, pixelPos, vec4f(newPressure, 0, 0, 1));
      }

      struct projectFn_Input_26 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(0) var vel_27: texture_2d<f32>;

      fn getNeighbors_28(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var p_29: texture_2d<f32>;

      @group(0) @binding(2) var out_30: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn projectFn_25(input: projectFn_Input_26) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel_27));
        var velocity = textureLoad(vel_27, pixelPos, 0);
        var neighbors = getNeighbors_28(pixelPos, texSize);
        var leftPressure = textureLoad(p_29, neighbors[0], 0);
        var upPressure = textureLoad(p_29, neighbors[1], 0);
        var rightPressure = textureLoad(p_29, neighbors[2], 0);
        var downPressure = textureLoad(p_29, neighbors[3], 0);
        var pressureGrad = vec2f((0.5 * (rightPressure.x - leftPressure.x)), (0.5 * (downPressure.x - upPressure.x)));
        var projectedVel = (velocity.xy - pressureGrad);
        textureStore(out_30, pixelPos, vec4f(projectedVel, 0, 1));
      }

      struct advectInkFn_Input_32 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var src_33: texture_2d<f32>;

      @group(0) @binding(0) var vel_34: texture_2d<f32>;

      struct ShaderParams_36 {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(3) var<uniform> simParams_35: ShaderParams_36;

      @group(0) @binding(4) var linSampler_37: sampler;

      @group(0) @binding(2) var dst_38: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn advectInkFn_31(input: advectInkFn_Input_32) {
        var texSize = textureDimensions(src_33);
        var pixelPos = input.gid.xy;
        var velocity = textureLoad(vel_34, pixelPos, 0).xy;
        var timeStep = simParams_35.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity));
        var clampedPos = clamp(prevPos, vec2f(-0.5), (vec2f(texSize.xy) - vec2f(0.5)));
        var normalizedPos = ((clampedPos + vec2f(0.5)) / vec2f(texSize.xy));
        var inkVal = textureSampleLevel(src_33, linSampler_37, normalizedPos, 0);
        textureStore(dst_38, pixelPos, inkVal);
      }

      struct renderFn_Input_40 {
        @builtin(vertex_index) idx: u32,
      }

      struct renderFn_Output_41 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn renderFn_39(input: renderFn_Input_40) -> renderFn_Output_41 {
        var vertices = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        var texCoords = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return renderFn_Output_41(vec4f(vertices[input.idx], 0, 1), texCoords[input.idx]);
      }

      struct fragmentImageFn_Input_43 {
        @location(0) uv: vec2f,
      }

      @group(0) @binding(0) var result_44: texture_2d<f32>;

      @group(0) @binding(2) var linSampler_45: sampler;

      @group(0) @binding(1) var background_46: texture_2d<f32>;

      @fragment fn fragmentImageFn_42(input: fragmentImageFn_Input_43) -> @location(0) vec4f {
        var pixelStep = 0.001953125f;
        var leftSample = textureSample(result_44, linSampler_45, vec2f((input.uv.x - pixelStep), input.uv.y)).x;
        var rightSample = textureSample(result_44, linSampler_45, vec2f((input.uv.x + pixelStep), input.uv.y)).x;
        var upSample = textureSample(result_44, linSampler_45, vec2f(input.uv.x, (input.uv.y + pixelStep))).x;
        var downSample = textureSample(result_44, linSampler_45, vec2f(input.uv.x, (input.uv.y - pixelStep))).x;
        var gradientX = (rightSample - leftSample);
        var gradientY = (upSample - downSample);
        var distortStrength = 0.8;
        var distortVector = vec2f(gradientX, gradientY);
        var distortedUV = (input.uv + (distortVector * vec2f(distortStrength, -distortStrength)));
        var outputColor = textureSample(background_46, linSampler_45, vec2f(distortedUV.x, (1 - distortedUV.y)));
        return vec4f(outputColor.xyz, 1);
      }"
    `);
  });
});
