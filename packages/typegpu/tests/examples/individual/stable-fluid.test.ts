/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mockCreateImageBitmap,
  mockImageLoading,
} from '../utils/commonMocks.ts';

describe('stable-fluid example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'stable-fluid',
      setupMocks: () => {
        mockImageLoading();
        mockCreateImageBitmap();
      },
      expectedCalls: 7,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var src: texture_2d<f32>;

      @group(0) @binding(1) var dst: texture_storage_2d<rgba16float, write>;

      struct ShaderParams {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams: ShaderParams;

      @group(0) @binding(3) var linSampler: sampler;

      struct advectFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn advectFn(input: advectFn_Input) {
        var texSize = textureDimensions(src);
        var pixelPos = input.gid.xy;
        if (((((pixelPos.x >= (texSize.x - 1u)) || (pixelPos.y >= (texSize.y - 1u))) || (pixelPos.x <= 0u)) || (pixelPos.y <= 0u))) {
          textureStore(dst, pixelPos, vec4f(0, 0, 0, 1));
          return;
        }
        var velocity = textureLoad(src, pixelPos, 0);
        let timeStep = simParams.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity.xy));
        var clampedPos = clamp(prevPos, vec2f(-0.5), (vec2f(texSize.xy) - 0.5f));
        var normalizedPos = ((clampedPos + 0.5f) / vec2f(texSize.xy));
        var prevVelocity = textureSampleLevel(src, linSampler, normalizedPos, 0);
        textureStore(dst, pixelPos, prevVelocity);
      }

      @group(0) @binding(0) var in: texture_2d<f32>;

      fn getNeighbors(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      struct ShaderParams {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(2) var<uniform> simParams: ShaderParams;

      @group(0) @binding(1) var out: texture_storage_2d<rgba16float, write>;

      struct diffusionFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn diffusionFn(input: diffusionFn_Input) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(in));
        var centerVal = textureLoad(in, pixelPos, 0);
        var neighbors = getNeighbors(pixelPos, texSize);
        var leftVal = textureLoad(in, neighbors[0i], 0);
        var upVal = textureLoad(in, neighbors[1i], 0);
        var rightVal = textureLoad(in, neighbors[2i], 0);
        var downVal = textureLoad(in, neighbors[3i], 0);
        let timeStep = simParams.dt;
        let viscosity = simParams.viscosity;
        let diffuseRate = (viscosity * timeStep);
        let blendFactor = (1f / (4f + diffuseRate));
        var diffusedVal = (vec4f(blendFactor) * ((((leftVal + rightVal) + upVal) + downVal) + (centerVal * diffuseRate)));
        textureStore(out, pixelPos, diffusedVal);
      }

      @group(0) @binding(0) var vel: texture_2d<f32>;

      fn getNeighbors(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var div: texture_storage_2d<rgba16float, write>;

      struct divergenceFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn divergenceFn(input: divergenceFn_Input) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel));
        var neighbors = getNeighbors(pixelPos, texSize);
        var leftVel = textureLoad(vel, neighbors[0i], 0);
        var upVel = textureLoad(vel, neighbors[1i], 0);
        var rightVel = textureLoad(vel, neighbors[2i], 0);
        var downVel = textureLoad(vel, neighbors[3i], 0);
        let divergence = (0.5f * ((rightVel.x - leftVel.x) + (downVel.y - upVel.y)));
        textureStore(div, pixelPos, vec4f(divergence, 0f, 0f, 1f));
      }

      @group(0) @binding(0) var x: texture_2d<f32>;

      fn getNeighbors(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var b: texture_2d<f32>;

      @group(0) @binding(2) var out: texture_storage_2d<rgba16float, write>;

      struct pressureFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn pressureFn(input: pressureFn_Input) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(x));
        var neighbors = getNeighbors(pixelPos, texSize);
        var leftPressure = textureLoad(x, neighbors[0i], 0);
        var upPressure = textureLoad(x, neighbors[1i], 0);
        var rightPressure = textureLoad(x, neighbors[2i], 0);
        var downPressure = textureLoad(x, neighbors[3i], 0);
        let divergence = textureLoad(b, pixelPos, 0).x;
        let newPressure = (0.25f * ((((leftPressure.x + rightPressure.x) + upPressure.x) + downPressure.x) - divergence));
        textureStore(out, pixelPos, vec4f(newPressure, 0f, 0f, 1f));
      }

      @group(0) @binding(0) var vel: texture_2d<f32>;

      fn getNeighbors(coords: vec2i, bounds: vec2i) -> array<vec2i, 4> {
        var adjacentOffsets = array<vec2i, 4>(vec2i(-1, 0), vec2i(0, -1), vec2i(1, 0), vec2i(0, 1));
        for (var i = 0; (i < 4i); i++) {
          adjacentOffsets[i] = clamp((coords + adjacentOffsets[i]), vec2i(), (bounds - vec2i(1)));
        }
        return adjacentOffsets;
      }

      @group(0) @binding(1) var p: texture_2d<f32>;

      @group(0) @binding(2) var out: texture_storage_2d<rgba16float, write>;

      struct projectFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn projectFn(input: projectFn_Input) {
        var pixelPos = vec2i(input.gid.xy);
        var texSize = vec2i(textureDimensions(vel));
        var velocity = textureLoad(vel, pixelPos, 0);
        var neighbors = getNeighbors(pixelPos, texSize);
        var leftPressure = textureLoad(p, neighbors[0i], 0);
        var upPressure = textureLoad(p, neighbors[1i], 0);
        var rightPressure = textureLoad(p, neighbors[2i], 0);
        var downPressure = textureLoad(p, neighbors[3i], 0);
        var pressureGrad = vec2f((0.5f * (rightPressure.x - leftPressure.x)), (0.5f * (downPressure.x - upPressure.x)));
        var projectedVel = (velocity.xy - pressureGrad);
        textureStore(out, pixelPos, vec4f(projectedVel, 0f, 1f));
      }

      @group(0) @binding(1) var src: texture_2d<f32>;

      @group(0) @binding(0) var vel: texture_2d<f32>;

      struct ShaderParams {
        dt: f32,
        viscosity: f32,
      }

      @group(0) @binding(3) var<uniform> simParams: ShaderParams;

      @group(0) @binding(4) var linSampler: sampler;

      @group(0) @binding(2) var dst: texture_storage_2d<rgba16float, write>;

      struct advectInkFn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(16, 16) fn advectInkFn(input: advectInkFn_Input) {
        var texSize = textureDimensions(src);
        var pixelPos = input.gid.xy;
        var velocity = textureLoad(vel, pixelPos, 0).xy;
        let timeStep = simParams.dt;
        var prevPos = (vec2f(pixelPos) - (timeStep * velocity));
        var clampedPos = clamp(prevPos, vec2f(-0.5), (vec2f(texSize.xy) - vec2f(0.5)));
        var normalizedPos = ((clampedPos + 0.5f) / vec2f(texSize.xy));
        var inkVal = textureSampleLevel(src, linSampler, normalizedPos, 0);
        textureStore(dst, pixelPos, inkVal);
      }

      struct renderFn_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct renderFn_Input {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn renderFn(input: renderFn_Input) -> renderFn_Output {
        var vertices = array<vec2f, 3>(vec2f(-1), vec2f(3, -1), vec2f(-1, 3));
        var texCoords = array<vec2f, 3>(vec2f(), vec2f(2, 0), vec2f(0, 2));
        return renderFn_Output(vec4f(vertices[input.idx], 0f, 1f), texCoords[input.idx]);
      }

      @group(0) @binding(0) var result: texture_2d<f32>;

      @group(0) @binding(2) var linSampler: sampler;

      @group(0) @binding(1) var background: texture_2d<f32>;

      struct fragmentImageFn_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentImageFn(input: fragmentImageFn_Input) -> @location(0) vec4f {
        const pixelStep = 0.001953125f;
        let leftSample = textureSample(result, linSampler, vec2f((input.uv.x - pixelStep), input.uv.y)).x;
        let rightSample = textureSample(result, linSampler, vec2f((input.uv.x + pixelStep), input.uv.y)).x;
        let upSample = textureSample(result, linSampler, vec2f(input.uv.x, (input.uv.y + pixelStep))).x;
        let downSample = textureSample(result, linSampler, vec2f(input.uv.x, (input.uv.y - pixelStep))).x;
        let gradientX = (rightSample - leftSample);
        let gradientY = (upSample - downSample);
        const distortStrength = 0.8;
        var distortVector = vec2f(gradientX, gradientY);
        var distortedUV = (input.uv + (distortVector * vec2f(distortStrength, -(distortStrength))));
        var outputColor = textureSample(background, linSampler, vec2f(distortedUV.x, (1f - distortedUV.y)));
        return vec4f(outputColor.rgb, 1f);
      }"
    `);
  });
});
