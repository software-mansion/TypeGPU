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
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'simple-shadow',
        setupMocks: mockResizeObserver,
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Material {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
      }

      struct InstanceInfo {
        modelMatrix: mat4x4f,
        material: Material,
      }

      @group(1) @binding(0) var<uniform> instanceInfo: InstanceInfo;

      struct LightSpace {
        viewProj: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> lightSpaceUniform: LightSpace;

      struct shadowVert_Output {
        @builtin(position) pos: vec4f,
      }

      struct shadowVert_Input {
        @location(0) position: vec4f,
      }

      @vertex fn shadowVert(_arg_0: shadowVert_Input) -> shadowVert_Output {
        var world = (instanceInfo.modelMatrix * _arg_0.position);
        var clip = (lightSpaceUniform.viewProj * world);
        return shadowVert_Output(clip);
      }

      struct Material {
        ambient: vec3f,
        diffuse: vec3f,
        specular: vec3f,
        shininess: f32,
      }

      struct InstanceInfo {
        modelMatrix: mat4x4f,
        material: Material,
      }

      @group(1) @binding(0) var<uniform> instanceInfo: InstanceInfo;

      struct Camera {
        projection: mat4x4f,
        view: mat4x4f,
        position: vec3f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      struct mainVert_Output {
        @builtin(position) pos: vec4f,
        @location(0) normal: vec4f,
        @location(1) worldPos: vec3f,
      }

      struct mainVert_Input {
        @location(0) position: vec4f,
        @location(1) normal: vec4f,
      }

      @vertex fn mainVert(_arg_0: mainVert_Input) -> mainVert_Output {
        let modelMatrixUniform = (&instanceInfo.modelMatrix);
        var worldPos = ((*modelMatrixUniform) * _arg_0.position);
        var viewPos = (cameraUniform.view * worldPos);
        var clipPos = (cameraUniform.projection * viewPos);
        var transformedNormal = ((*modelMatrixUniform) * _arg_0.normal);
        return mainVert_Output(clipPos, transformedNormal, worldPos.xyz);
      }

      struct DirectionalLight {
        direction: vec3f,
        color: vec3f,
      }

      @group(0) @binding(1) var<uniform> light: DirectionalLight;

      struct LightSpace {
        viewProj: mat4x4f,
      }

      @group(0) @binding(2) var<uniform> lightSpaceUniform: LightSpace;

      @group(2) @binding(0) var shadowMap: texture_depth_2d;

      @group(2) @binding(1) var comparisonSampler: sampler_comparison;

      struct VisParams {
        shadowOnly: f32,
        lightDepth: f32,
      }

      @group(0) @binding(3) var<uniform> paramsUniform: VisParams;

      struct mainFrag_Input {
        @location(0) normal: vec4f,
        @location(1) worldPos: vec3f,
      }

      @fragment fn mainFrag(_arg_0: mainFrag_Input) -> @location(0) vec4f {
        let instanceInfo_1 = (&instanceInfo);
        var N = normalize(_arg_0.normal.xyz);
        var L = normalize(-(light.direction));
        var V = normalize((cameraUniform.position - _arg_0.worldPos));
        var R = reflect(-(L), N);
        var lp4 = (lightSpaceUniform.viewProj * vec4f(_arg_0.worldPos, 1f));
        var ndc = (lp4.xyz / lp4.w);
        var uv = ((ndc.xy * 0.5f) + 0.5f);
        uv = vec2f(uv.x, (1f - uv.y));
        let currentDepth = ndc.z;
        let inBounds = (all((uv >= vec2f())) && all((uv <= vec2f(1))));
        var shadowFactor = textureSampleCompare(shadowMap, comparisonSampler, uv, currentDepth);
        if (!inBounds) {
          shadowFactor = 1f;
        }
        var ambient = ((*instanceInfo_1).material.ambient * light.color);
        let diff = max(0f, dot(N, L));
        var diffuse = (((*instanceInfo_1).material.diffuse * light.color) * diff);
        let spec = pow(max(0f, dot(V, R)), (*instanceInfo_1).material.shininess);
        var specular = (((*instanceInfo_1).material.specular * light.color) * spec);
        var lit = ((diffuse + specular) * shadowFactor);
        var finalColor = (ambient + lit);
        if ((paramsUniform.shadowOnly == 1f)) {
          return vec4f(vec3f(shadowFactor), 1f);
        }
        if ((paramsUniform.lightDepth == 1f)) {
          let remappedDepth = clamp(((currentDepth - 0.2f) / 0.49999999999999994f), 0f, 1f);
          return vec4f(vec3f(remappedDepth), 1f);
        }
        return vec4f(finalColor, 1f);
      }"
    `);
  });
});
