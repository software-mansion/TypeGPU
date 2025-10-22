/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('simple shadow example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'simple-shadow',
      setupMocks: mockResizeObserver,
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Material_3 {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
      }

      struct InstanceInfo_2 {
        modelMatrix: mat4x4f,
        material: Material_3,
      }

      @group(1) @binding(0) var<uniform> instanceInfo_1: InstanceInfo_2;

      struct LightSpace_5 {
        viewProj: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> lightSpaceUniform_4: LightSpace_5;

      struct shadowVert_Output_6 {
        @builtin(position) pos: vec4f,
      }

      struct shadowVert_Input_7 {
        @location(0) position: vec4f,
      }

      @vertex fn shadowVert_0(_arg_0: shadowVert_Input_7) -> shadowVert_Output_6 {
        var world = (instanceInfo_1.modelMatrix * _arg_0.position);
        var clip = (lightSpaceUniform_4.viewProj * world);
        return shadowVert_Output_6(clip);
      }

      struct Material_3 {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
      }

      struct InstanceInfo_2 {
        modelMatrix: mat4x4f,
        material: Material_3,
      }

      @group(1) @binding(0) var<uniform> instanceInfo_1: InstanceInfo_2;

      struct Camera_5 {
        projection: mat4x4f,
        view: mat4x4f,
        position: vec3f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform_4: Camera_5;

      struct mainVert_Output_6 {
        @builtin(position) pos: vec4f,
        @location(0) normal: vec4f,
        @location(1) worldPos: vec3f,
      }

      struct mainVert_Input_7 {
        @location(0) position: vec4f,
        @location(1) normal: vec4f,
      }

      @vertex fn mainVert_0(_arg_0: mainVert_Input_7) -> mainVert_Output_6 {
        var modelMatrixUniform = instanceInfo_1.modelMatrix;
        var worldPos = (modelMatrixUniform * _arg_0.position);
        var viewPos = (cameraUniform_4.view * worldPos);
        var clipPos = (cameraUniform_4.projection * viewPos);
        var transformedNormal = (modelMatrixUniform * _arg_0.normal);
        return mainVert_Output_6(clipPos, transformedNormal, worldPos.xyz);
      }

      struct DirectionalLight_10 {
        direction: vec3f,
        color: vec3f,
      }

      @group(0) @binding(1) var<uniform> light_9: DirectionalLight_10;

      struct LightSpace_12 {
        viewProj: mat4x4f,
      }

      @group(0) @binding(2) var<uniform> lightSpaceUniform_11: LightSpace_12;

      @group(2) @binding(0) var shadowMap_13: texture_depth_2d;

      @group(2) @binding(1) var comparisonSampler_14: sampler_comparison;

      struct VisParams_16 {
        shadowOnly: f32,
        lightDepth: f32,
      }

      @group(0) @binding(3) var<uniform> paramsUniform_15: VisParams_16;

      struct mainFrag_Input_17 {
        @location(0) normal: vec4f,
        @location(1) worldPos: vec3f,
      }

      @fragment fn mainFrag_8(_arg_0: mainFrag_Input_17) -> @location(0) vec4f {
        var instanceInfo = instanceInfo_1;
        var N = normalize(_arg_0.normal.xyz);
        var L = normalize(-(light_9.direction));
        var V = normalize((cameraUniform_4.position - _arg_0.worldPos));
        var R = reflect(-(L), N);
        var lp4 = (lightSpaceUniform_11.viewProj * vec4f(_arg_0.worldPos, 1));
        var ndc = (lp4.xyz / lp4.w);
        var uv = ((ndc.xy * 0.5) + 0.5);
        uv = vec2f(uv.x, (1 - uv.y));
        var currentDepth = ndc.z;
        var inBounds = (all((uv >= vec2f())) && all((uv <= vec2f(1))));
        var shadowFactor = textureSampleCompare(shadowMap_13, comparisonSampler_14, uv, currentDepth);
        if (!inBounds) {
          shadowFactor = 1;
        }
        var ambient = (instanceInfo.material.ambient * light_9.color);
        var diff = max(0, dot(N, L));
        var diffuse = ((instanceInfo.material.diffuse * light_9.color) * diff);
        var spec = pow(max(0, dot(V, R)), instanceInfo.material.shininess);
        var specular = ((instanceInfo.material.specular * light_9.color) * spec);
        var lit = ((diffuse + specular) * shadowFactor);
        var finalColor = (ambient + lit);
        if ((paramsUniform_15.shadowOnly == 1)) {
          return vec4f(vec3f(shadowFactor), 1);
        }
        if ((paramsUniform_15.lightDepth == 1)) {
          var remappedDepth = clamp(((currentDepth - 0.2) / 0.49999999999999994f), 0, 1);
          return vec4f(vec3f(remappedDepth), 1);
        }
        return vec4f(finalColor, 1);
      }"
    `);
  });
});
