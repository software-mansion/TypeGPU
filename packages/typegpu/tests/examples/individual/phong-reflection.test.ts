/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import {
  mock3DModelLoading,
  mockCreateImageBitmap,
  mockResizeObserver,
} from '../utils/commonMocks.ts';

describe('phong reflection example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'phong-reflection',
      setupMocks: () => {
        mockResizeObserver();
        mockCreateImageBitmap();
        mock3DModelLoading();
      },
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Camera_2 {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform_1: Camera_2;

      struct vertexShader_Output_3 {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
      }

      struct vertexShader_Input_4 {
        @location(0) modelPosition: vec3f,
        @location(1) modelNormal: vec3f,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn vertexShader_0(input: vertexShader_Input_4) -> vertexShader_Output_3 {
        var worldPosition = vec4f(input.modelPosition, 1f);
        let camera = (&cameraUniform_1);
        var canvasPosition = (((*camera).projection * (*camera).view) * worldPosition);
        return vertexShader_Output_3(input.modelPosition, input.modelNormal, canvasPosition);
      }

      struct ExampleControls_7 {
        lightColor: vec3f,
        lightDirection: vec3f,
        ambientColor: vec3f,
        ambientStrength: f32,
        specularExponent: f32,
      }

      @group(0) @binding(1) var<uniform> exampleControlsUniform_6: ExampleControls_7;

      struct fragmentShader_Input_8 {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
      }

      @fragment fn fragmentShader_5(input: fragmentShader_Input_8) -> @location(0) vec4f {
        var lightColor = normalize(exampleControlsUniform_6.lightColor);
        var lightDirection = normalize(exampleControlsUniform_6.lightDirection);
        let ambientColor = (&exampleControlsUniform_6.ambientColor);
        let ambientStrength = exampleControlsUniform_6.ambientStrength;
        let specularStrength = exampleControlsUniform_6.specularExponent;
        var ambient = ((*ambientColor) * ambientStrength);
        let cosTheta = dot(input.worldNormal, lightDirection);
        var diffuse = (lightColor * max(0f, cosTheta));
        var reflectionDirection = reflect((lightDirection * -1), input.worldNormal);
        var viewDirection = normalize((cameraUniform_1.position.xyz - input.worldPosition));
        var specular = (lightColor * pow(max(0f, dot(reflectionDirection, viewDirection)), specularStrength));
        var color = ((ambient + diffuse) + specular);
        return vec4f(color, 1f);
      }"
    `);
  });
});
