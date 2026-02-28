/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('two boxes example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'two-boxes',
        setupMocks: mockResizeObserver,
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Camera {
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera: Camera;

      struct Transform {
        model: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> transform: Transform;

      struct vertex_Output {
        @builtin(position) pos: vec4f,
        @location(0) color: vec4f,
      }

      struct vertex_Input {
        @location(0) position: vec4f,
        @location(1) color: vec4f,
      }

      @vertex fn vertex(input: vertex_Input) -> vertex_Output {
        var pos = (camera.projection * (camera.view * (transform.model * input.position)));
        return vertex_Output(pos, input.color);
      }

      struct fragment_Input {
        @location(0) color: vec4f,
      }

      @fragment fn fragment(input: fragment_Input) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });
});
