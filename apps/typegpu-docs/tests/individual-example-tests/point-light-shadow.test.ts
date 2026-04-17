/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('point light shadow example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'point-light-shadow',
        setupMocks: mockResizeObserver,
        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct CameraData {
        viewProjectionMatrix: mat4x4f,
        inverseViewProjectionMatrix: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera: CameraData;

      struct vertexDepth_Output {
        @builtin(position) pos: vec4f,
        @location(0) worldPos: vec3f,
      }

      @vertex fn vertexDepth(@location(0) position: vec3f, @location(3) column1: vec4f, @location(4) column2: vec4f, @location(5) column3: vec4f, @location(6) column4: vec4f) -> vertexDepth_Output {
        let modelMatrix = mat4x4f(column1, column2, column3, column4);
        let worldPos = (modelMatrix * vec4f(position, 1f)).xyz;
        let pos = (camera.viewProjectionMatrix * vec4f(worldPos, 1f));
        return vertexDepth_Output(pos, worldPos);
      }

      @group(0) @binding(1) var<uniform> lightPosition: vec3f;

      struct fragmentDepth_Input {
        @location(0) worldPos: vec3f,
      }

      @fragment fn fragmentDepth(_arg_0: fragmentDepth_Input) -> @builtin(frag_depth) f32 {
        let dist = length((_arg_0.worldPos - lightPosition));
        return (dist / 100f);
      }

      struct CameraData {
        viewProjectionMatrix: mat4x4f,
        inverseViewProjectionMatrix: mat4x4f,
      }

      @group(1) @binding(0) var<uniform> camera: CameraData;

      struct vertexMain_Output {
        @builtin(position) pos: vec4f,
        @location(0) worldPos: vec3f,
        @location(1) uv: vec2f,
        @location(2) normal: vec3f,
      }

      @vertex fn vertexMain(@location(0) position: vec3f, @location(2) uv: vec2f, @location(1) normal: vec3f, @location(3) column1: vec4f, @location(4) column2: vec4f, @location(5) column3: vec4f, @location(6) column4: vec4f) -> vertexMain_Output {
        let modelMatrix = mat4x4f(column1, column2, column3, column4);
        let worldPos = (modelMatrix * vec4f(position, 1f)).xyz;
        let pos = (camera.viewProjectionMatrix * vec4f(worldPos, 1f));
        let worldNormal = normalize((modelMatrix * vec4f(normal, 0f)).xyz);
        return vertexMain_Output(pos, worldPos, uv, worldNormal);
      }

      @group(1) @binding(3) var<uniform> lightPosition: vec3f;

      struct item {
        pcfSamples: u32,
        diskRadius: f32,
        normalBiasBase: f32,
        normalBiasSlope: f32,
      }

      @group(0) @binding(0) var<uniform> shadowParams: item;

      @group(0) @binding(1) var<uniform> samplesUniform: array<vec4f, 64>;

      @group(1) @binding(1) var shadowDepthCube: texture_depth_cube;

      @group(1) @binding(2) var shadowSampler: sampler_comparison;

      struct fragmentMain_Input {
        @location(0) worldPos: vec3f,
        @location(1) uv: vec2f,
        @location(2) normal: vec3f,
      }

      @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
        let lightPos = (&lightPosition);
        let toLight = ((*lightPos) - _arg_0.worldPos);
        let dist = length(toLight);
        let lightDir = (toLight / dist);
        let ndotl = max(dot(_arg_0.normal, lightDir), 0f);
        let normalBiasWorld = (shadowParams.normalBiasBase + (shadowParams.normalBiasSlope * (1f - ndotl)));
        let biasedPos = (_arg_0.worldPos + (_arg_0.normal * normalBiasWorld));
        let toLightBiased = (biasedPos - (*lightPos));
        let distBiased = length(toLightBiased);
        let dir = ((toLightBiased / distBiased) * vec3f(-1, 1, 1));
        let depthRef = (distBiased / 100f);
        let up = select(vec3f(1, 0, 0), vec3f(0, 1, 0), (abs(dir.y) < 0.9998999834060669f));
        let right = normalize(cross(up, dir));
        let realUp = cross(dir, right);
        let PCF_SAMPLES = shadowParams.pcfSamples;
        let diskRadius = shadowParams.diskRadius;
        var visibilityAcc = 0f;
        for (var i = 0u; (i < PCF_SAMPLES); i++) {
          let o = (samplesUniform[i].xy * diskRadius);
          let sampleDir = ((dir + (right * o.x)) + (realUp * o.y));
          visibilityAcc += textureSampleCompare(shadowDepthCube, shadowSampler, sampleDir, depthRef);
        }
        let rawNdotl = dot(_arg_0.normal, lightDir);
        let visibility = select((visibilityAcc / f32(PCF_SAMPLES)), 0f, (rawNdotl < 0f));
        let baseColor = vec3f(1, 0.5, 0.3100000023841858);
        let color = (baseColor * ((ndotl * visibility) + 0.1f));
        return vec4f(color, 1f);
      }

      @group(0) @binding(1) var<uniform> lightPosition: vec3f;

      struct CameraData {
        viewProjectionMatrix: mat4x4f,
        inverseViewProjectionMatrix: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera: CameraData;

      struct vertexLightIndicator_Output {
        @builtin(position) pos: vec4f,
      }

      @vertex fn vertexLightIndicator(@location(0) position: vec3f) -> vertexLightIndicator_Output {
        let worldPos = ((position * 0.15f) + lightPosition);
        let pos = (camera.viewProjectionMatrix * vec4f(worldPos, 1f));
        return vertexLightIndicator_Output(pos);
      }

      @fragment fn fragmentLightIndicator() -> @location(0) vec4f {
        return vec4f(1, 1, 0.5, 1);
      }"
    `);
  });
});
