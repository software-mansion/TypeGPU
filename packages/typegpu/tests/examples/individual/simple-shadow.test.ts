/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('oklab example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'simple-shadow',
      setupMocks: mockResizeObserver,
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct shadowVert_Input_1 {
        @location(0) position: vec4f,
      }

      struct shadowVert_Output_2 {
        @builtin(position) pos: vec4f,
      }

      struct Material_5 {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
      }

      struct InstanceInfo_4 {
        modelMatrix: mat4x4f,
        material: Material_5,
      }

      @group(1) @binding(0) var<uniform> instanceInfo_3: InstanceInfo_4;

      struct LightSpace_7 {
        viewProj: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> lightSpaceUniform_6: LightSpace_7;

      @vertex fn shadowVert_0(_arg_0: shadowVert_Input_1) -> shadowVert_Output_2 {
        var world = (instanceInfo_3.modelMatrix * _arg_0.position);
        var clip = (lightSpaceUniform_6.viewProj * world);
        return shadowVert_Output_2(clip);
      }

      struct mainVert_Input_9 {
        @location(0) position: vec4f,
        @location(1) normal: vec4f,
      }

      struct mainVert_Output_10 {
        @builtin(position) pos: vec4f,
        @location(0) normal: vec4f,
        @location(1) worldPos: vec3f,
      }

      struct Material_13 {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
      }

      struct InstanceInfo_12 {
        modelMatrix: mat4x4f,
        material: Material_13,
      }

      @group(1) @binding(0) var<uniform> instanceInfo_11: InstanceInfo_12;

      struct Camera_15 {
        projection: mat4x4f,
        view: mat4x4f,
        position: vec3f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform_14: Camera_15;

      @vertex fn mainVert_8(_arg_0: mainVert_Input_9) -> mainVert_Output_10 {
        var modelMatrixUniform = instanceInfo_11.modelMatrix;
        var worldPos = (modelMatrixUniform * _arg_0.position);
        var viewPos = (cameraUniform_14.view * worldPos);
        var clipPos = (cameraUniform_14.projection * viewPos);
        var transformedNormal = (modelMatrixUniform * _arg_0.normal);
        return mainVert_Output_10(clipPos, transformedNormal, worldPos.xyz);
      }

      struct mainFrag_Input_17 {
        @location(0) normal: vec4f,
        @location(1) worldPos: vec3f,
        @builtin(front_facing) frontFacing: bool,
      }

      struct DirectionalLight_19 {
        direction: vec3f,
        color: vec3f,
      }

      @group(0) @binding(1) var<uniform> light_18: DirectionalLight_19;

      struct LightSpace_21 {
        viewProj: mat4x4f,
      }

      @group(0) @binding(2) var<uniform> lightSpaceUniform_20: LightSpace_21;

      @group(2) @binding(0) var shadowMap_22: texture_depth_2d;

      @group(0) @binding(3) var comparisonSampler_23: sampler_comparison;

      struct VisParams_25 {
        shadowOnly: f32,
        lightDepth: f32,
      }

      @group(0) @binding(4) var<uniform> paramsUniform_24: VisParams_25;

      @fragment fn mainFrag_16(_arg_0: mainFrag_Input_17) -> @location(0) vec4f {
        var instanceInfo = instanceInfo_11;
        var N = normalize(_arg_0.normal.xyz);
        if (!_arg_0.frontFacing) {
          N = -(N);
        }
        var L = normalize(-(light_18.direction));
        var V = normalize((cameraUniform_14.position - _arg_0.worldPos));
        var R = reflect(-(L), N);
        var lp4 = (lightSpaceUniform_20.viewProj * vec4f(_arg_0.worldPos, 1));
        var ndc = (lp4.xyz / lp4.w);
        var uv = ((ndc.xy * 0.5) + 0.5);
        uv = vec2f(uv.x, (1 - uv.y));
        var currentDepth = ndc.z;
        var inBounds = (all((uv >= vec2f())) && all((uv <= vec2f(1))));
        var shadowFactor = textureSampleCompare(shadowMap_22, comparisonSampler_23, uv, currentDepth);
        if (!inBounds) {
          shadowFactor = 1;
        }
        var ambient = (instanceInfo.material.ambient * light_18.color);
        var diff = max(0, dot(N, L));
        var diffuse = ((instanceInfo.material.diffuse * light_18.color) * diff);
        var spec = pow(max(0, dot(V, R)), instanceInfo.material.shininess);
        var specular = ((instanceInfo.material.specular * light_18.color) * spec);
        var lit = ((diffuse + specular) * shadowFactor);
        var finalColor = (ambient + lit);
        if ((paramsUniform_24.shadowOnly == 1)) {
          return vec4f(vec3f(shadowFactor), 1);
        }
        if ((paramsUniform_24.lightDepth == 1)) {
          var remappedDepth = clamp(((currentDepth - 0.2) / 0.49999999999999994f), 0, 1);
          return vec4f(vec3f(remappedDepth), 1);
        }
        return vec4f(finalColor, 1);
      }"
    `);
  });
});
