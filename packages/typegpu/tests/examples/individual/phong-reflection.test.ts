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
      "struct Camera {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> cameraUniform: Camera;

      struct vertexShader_Output {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
      }

      struct vertexShader_Input {
        @location(0) modelPosition: vec3f,
        @location(1) modelNormal: vec3f,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn vertexShader(input: vertexShader_Input) -> vertexShader_Output {
        var worldPosition = vec4f(input.modelPosition, 1f);
        let camera = (&cameraUniform);
        var canvasPosition = (((*camera).projection * (*camera).view) * worldPosition);
        return vertexShader_Output(input.modelPosition, input.modelNormal, canvasPosition);
      }

      struct ExampleControls {
        lightColor: vec3f,
        lightDirection: vec3f,
        ambientColor: vec3f,
        ambientStrength: f32,
        specularExponent: f32,
      }

      @group(0) @binding(1) var<uniform> exampleControlsUniform: ExampleControls;

      struct fragmentShader_Input {
        @location(0) worldPosition: vec3f,
        @location(1) worldNormal: vec3f,
        @builtin(position) canvasPosition: vec4f,
      }

      @fragment fn fragmentShader(input: fragmentShader_Input) -> @location(0) vec4f {
        var lightColor = normalize(exampleControlsUniform.lightColor);
        var lightDirection = normalize(exampleControlsUniform.lightDirection);
        let ambientColor = (&exampleControlsUniform.ambientColor);
        let ambientStrength = exampleControlsUniform.ambientStrength;
        let specularStrength = exampleControlsUniform.specularExponent;
        var ambient = ((*ambientColor) * ambientStrength);
        let cosTheta = dot(input.worldNormal, lightDirection);
        var diffuse = (lightColor * max(0f, cosTheta));
        var reflectionDirection = reflect((lightDirection * -1f), input.worldNormal);
        var viewDirection = normalize((cameraUniform.position.xyz - input.worldPosition));
        var specular = (lightColor * pow(max(0f, dot(reflectionDirection, viewDirection)), specularStrength));
        var color = ((ambient + diffuse) + specular);
        return vec4f(color, 1f);
      }"
    `);
  });
});
