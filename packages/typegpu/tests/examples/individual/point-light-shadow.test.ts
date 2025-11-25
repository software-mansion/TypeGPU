/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('perlin noise example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'point-light-shadow',
      setupMocks: mockResizeObserver,
      expectedCalls: 3,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct CameraData_2 {
        viewProjectionMatrix: mat4x4f,
        inverseViewProjectionMatrix: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_1: CameraData_2;

      struct vertexDepth_Output_3 {
        @builtin(position) pos: vec4f,
        @location(0) worldPos: vec3f,
      }

      struct vertexDepth_Input_4 {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @location(3) column1: vec4f,
        @location(4) column2: vec4f,
        @location(5) column3: vec4f,
        @location(6) column4: vec4f,
      }

      @vertex fn vertexDepth_0(_arg_0: vertexDepth_Input_4) -> vertexDepth_Output_3 {
        var modelMatrix = mat4x4f(_arg_0.column1, _arg_0.column2, _arg_0.column3, _arg_0.column4);
        var worldPos = (modelMatrix * vec4f(_arg_0.position, 1f)).xyz;
        var pos = (camera_1.viewProjectionMatrix * vec4f(worldPos, 1f));
        return vertexDepth_Output_3(pos, worldPos);
      }

      @group(0) @binding(1) var<uniform> lightPosition_6: vec3f;

      struct fragmentDepth_Input_7 {
        @location(0) worldPos: vec3f,
      }

      @fragment fn fragmentDepth_5(_arg_0: fragmentDepth_Input_7) -> @builtin(frag_depth) f32 {
        let dist = length((_arg_0.worldPos - lightPosition_6));
        return (dist / 100f);
      }

      struct CameraData_2 {
        viewProjectionMatrix: mat4x4f,
        inverseViewProjectionMatrix: mat4x4f,
      }

      @group(1) @binding(0) var<uniform> camera_1: CameraData_2;

      struct vertexMain_Output_3 {
        @builtin(position) pos: vec4f,
        @location(0) worldPos: vec3f,
        @location(1) uv: vec2f,
        @location(2) normal: vec3f,
      }

      struct vertexMain_Input_4 {
        @location(0) position: vec3f,
        @location(1) normal: vec3f,
        @location(2) uv: vec2f,
        @location(3) column1: vec4f,
        @location(4) column2: vec4f,
        @location(5) column3: vec4f,
        @location(6) column4: vec4f,
      }

      @vertex fn vertexMain_0(_arg_0: vertexMain_Input_4) -> vertexMain_Output_3 {
        var modelMatrix = mat4x4f(_arg_0.column1, _arg_0.column2, _arg_0.column3, _arg_0.column4);
        var worldPos = (modelMatrix * vec4f(_arg_0.position, 1f)).xyz;
        var pos = (camera_1.viewProjectionMatrix * vec4f(worldPos, 1f));
        var worldNormal = normalize((modelMatrix * vec4f(_arg_0.normal, 0f)).xyz);
        return vertexMain_Output_3(pos, worldPos, _arg_0.uv, worldNormal);
      }

      @group(1) @binding(3) var<uniform> lightPosition_6: vec3f;

      struct item_8 {
        pcfSamples: u32,
        diskRadius: f32,
        normalBiasBase: f32,
        normalBiasSlope: f32,
      }

      @group(0) @binding(0) var<uniform> shadowParams_7: item_8;

      @group(1) @binding(1) var shadowDepthCube_9: texture_depth_cube;

      @group(1) @binding(2) var shadowSampler_10: sampler_comparison;

      struct fragmentMain_Input_11 {
        @location(0) worldPos: vec3f,
        @location(1) uv: vec2f,
        @location(2) normal: vec3f,
      }

      @fragment fn fragmentMain_5(_arg_0: fragmentMain_Input_11) -> @location(0) vec4f {
        let lightPos = (&lightPosition_6);
        var toLight = ((*lightPos) - _arg_0.worldPos);
        let dist = length(toLight);
        var lightDir = (toLight / dist);
        let ndotl = max(dot(_arg_0.normal, lightDir), 0f);
        let normalBiasWorld = (shadowParams_7.normalBiasBase + (shadowParams_7.normalBiasSlope * (1f - ndotl)));
        var biasedPos = (_arg_0.worldPos + (_arg_0.normal * normalBiasWorld));
        var toLightBiased = (biasedPos - (*lightPos));
        let distBiased = length(toLightBiased);
        var dir = (toLightBiased / distBiased);
        let depthRef = (distBiased / 100f);
        var up = select(vec3f(1, 0, 0), vec3f(0, 1, 0), (abs(dir.y) < 0.9998999834060669f));
        var right = normalize(cross(up, dir));
        var realUp = cross(dir, right);
        let PCF_SAMPLES = shadowParams_7.pcfSamples;
        let diskRadius = shadowParams_7.diskRadius;
        var visibilityAcc = 0;
        for (var i = 0; (i < i32(PCF_SAMPLES)); i++) {
          let index = f32(i);
          let theta2 = (index * 2.3999632f);
          let r = (sqrt((index / f32(PCF_SAMPLES))) * diskRadius);
          var sampleDir = normalize(((dir + (right * (cos(theta2) * r))) + (realUp * (sin(theta2) * r))));
          visibilityAcc += i32(textureSampleCompare(shadowDepthCube_9, shadowSampler_10, sampleDir, depthRef));
        }
        let rawNdotl = dot(_arg_0.normal, lightDir);
        let visibility = select((f32(visibilityAcc) / f32(PCF_SAMPLES)), 0f, (rawNdotl < 0f));
        var baseColor = vec3f(1, 0.5, 0.3100000023841858);
        var color = (baseColor * ((ndotl * visibility) + 0.1f));
        return vec4f(color, 1f);
      }

      @group(0) @binding(1) var<uniform> lightPosition_1: vec3f;

      struct CameraData_3 {
        viewProjectionMatrix: mat4x4f,
        inverseViewProjectionMatrix: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_2: CameraData_3;

      struct vertexLightIndicator_Output_4 {
        @builtin(position) pos: vec4f,
      }

      struct vertexLightIndicator_Input_5 {
        @location(0) position: vec3f,
      }

      @vertex fn vertexLightIndicator_0(_arg_0: vertexLightIndicator_Input_5) -> vertexLightIndicator_Output_4 {
        var worldPos = ((_arg_0.position * 0.15) + lightPosition_1);
        var pos = (camera_2.viewProjectionMatrix * vec4f(worldPos, 1f));
        return vertexLightIndicator_Output_4(pos);
      }

      @fragment fn fragmentLightIndicator_6() -> @location(0) vec4f {
        return vec4f(1, 1, 0.5, 1);
      }"
    `);
  });
});
