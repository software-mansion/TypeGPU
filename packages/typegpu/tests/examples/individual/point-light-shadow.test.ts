/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

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

      struct vertexDepth_Input {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @location(3) column1: vec4f,
        @location(4) column2: vec4f,
        @location(5) column3: vec4f,
        @location(6) column4: vec4f,
      }

      @vertex fn vertexDepth(_arg_0: vertexDepth_Input) -> vertexDepth_Output {
        var modelMatrix = mat4x4f(_arg_0.column1, _arg_0.column2, _arg_0.column3, _arg_0.column4);
        var worldPos = (modelMatrix * vec4f(_arg_0.position, 1f)).xyz;
        var pos = (camera.viewProjectionMatrix * vec4f(worldPos, 1f));
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

      struct vertexMain_Input {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @location(3) column1: vec4f,
        @location(4) column2: vec4f,
        @location(5) column3: vec4f,
        @location(6) column4: vec4f,
      }

      @vertex fn vertexMain(_arg_0: vertexMain_Input) -> vertexMain_Output {
        var modelMatrix = mat4x4f(_arg_0.column1, _arg_0.column2, _arg_0.column3, _arg_0.column4);
        var worldPos = (modelMatrix * vec4f(_arg_0.position, 1f)).xyz;
        var pos = (camera.viewProjectionMatrix * vec4f(worldPos, 1f));
        var worldNormal = normalize((modelMatrix * vec4f(_arg_0.normal, 0f)).xyz);
        return vertexMain_Output(pos, worldPos, _arg_0.uv, worldNormal);
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
        var toLight = ((*lightPos) - _arg_0.worldPos);
        let dist = length(toLight);
        var lightDir = (toLight / dist);
        let ndotl = max(dot(_arg_0.normal, lightDir), 0f);
        let normalBiasWorld = (shadowParams.normalBiasBase + (shadowParams.normalBiasSlope * (1f - ndotl)));
        var biasedPos = (_arg_0.worldPos + (_arg_0.normal * normalBiasWorld));
        var toLightBiased = (biasedPos - (*lightPos));
        let distBiased = length(toLightBiased);
        var dir = ((toLightBiased / distBiased) * vec3f(-1, 1, 1));
        let depthRef = (distBiased / 100f);
        var up = select(vec3f(1, 0, 0), vec3f(0, 1, 0), (abs(dir.y) < 0.9998999834060669f));
        var right = normalize(cross(up, dir));
        var realUp = cross(dir, right);
        let PCF_SAMPLES = shadowParams.pcfSamples;
        let diskRadius = shadowParams.diskRadius;
        var visibilityAcc = 0;
        for (var i = 0; (i < i32(PCF_SAMPLES)); i++) {
          var o = (samplesUniform[i].xy * diskRadius);
          var sampleDir = ((dir + (right * o.x)) + (realUp * o.y));
          visibilityAcc += i32(textureSampleCompare(shadowDepthCube, shadowSampler, sampleDir, depthRef));
        }
        let rawNdotl = dot(_arg_0.normal, lightDir);
        let visibility = select((f32(visibilityAcc) / f32(PCF_SAMPLES)), 0f, (rawNdotl < 0f));
        var baseColor = vec3f(1, 0.5, 0.3100000023841858);
        var color = (baseColor * ((ndotl * visibility) + 0.1f));
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

      struct vertexLightIndicator_Input {
        @location(0) position: vec3f,
      }

      @vertex fn vertexLightIndicator(_arg_0: vertexLightIndicator_Input) -> vertexLightIndicator_Output {
        var worldPos = ((_arg_0.position * 0.15f) + lightPosition);
        var pos = (camera.viewProjectionMatrix * vec4f(worldPos, 1f));
        return vertexLightIndicator_Output(pos);
      }

      @fragment fn fragmentLightIndicator() -> @location(0) vec4f {
        return vec4f(1, 1, 0.5, 1);
      }"
    `);
  });
});
