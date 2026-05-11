/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import {
  mock3DModelLoading,
  mockCreateImageBitmap,
  mockResizeObserver,
} from './utils/commonMocks.ts';

describe('phong reflection example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'phong-reflection',
        setupMocks: () => {
          mockResizeObserver();
          mockCreateImageBitmap();
          mock3DModelLoading();
        },
        expectedCalls: 1,
      },
      device,
    );

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

      @vertex fn vertexShader(@location(0) _arg_modelPosition: vec3f, @location(1) _arg_modelNormal: vec3f) -> vertexShader_Output {
        var worldPosition = vec4f(_arg_modelPosition, 1f);
        let camera = (&cameraUniform);
        var canvasPosition = (((*camera).projection * (*camera).view) * worldPosition);
        return vertexShader_Output(_arg_modelPosition, _arg_modelNormal, canvasPosition);
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
      }

      @fragment fn fragmentShader(_arg_0: fragmentShader_Input) -> @location(0) vec4f {
        var lightColor = normalize(exampleControlsUniform.lightColor);
        var lightDirection = normalize(exampleControlsUniform.lightDirection);
        let ambientColor = (&exampleControlsUniform.ambientColor);
        let ambientStrength = exampleControlsUniform.ambientStrength;
        let specularStrength = exampleControlsUniform.specularExponent;
        var ambient = ((*ambientColor) * ambientStrength);
        let cosTheta = dot(_arg_0.worldNormal, lightDirection);
        var diffuse = (lightColor * max(0f, cosTheta));
        var reflectionDirection = reflect((lightDirection * -1f), _arg_0.worldNormal);
        var viewDirection = normalize((cameraUniform.position.xyz - _arg_0.worldPosition));
        var specular = (lightColor * pow(max(0f, dot(reflectionDirection, viewDirection)), specularStrength));
        var color = ((ambient + diffuse) + specular);
        return vec4f(color, 1f);
      }"
    `);
  });
});
