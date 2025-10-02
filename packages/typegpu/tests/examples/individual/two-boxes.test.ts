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
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'two-boxes',
      setupMocks: mockResizeObserver,
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Camera_2 {
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_1: Camera_2;

      struct Transform_4 {
        model: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> transform_3: Transform_4;

      struct vertex_Output_5 {
        @builtin(position) pos: vec4f,
        @location(0) color: vec4f,
      }

      struct vertex_Input_6 {
        @location(0) position: vec4f,
        @location(1) color: vec4f,
      }

      @vertex fn vertex_0(input: vertex_Input_6) -> vertex_Output_5 {
        var pos = (camera_1.projection * (camera_1.view * (transform_3.model * input.position)));
        return vertex_Output_5(pos, input.color);
      }

      struct fragment_Input_8 {
        @location(0) color: vec4f,
      }

      @fragment fn fragment_7(input: fragment_Input_8) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });
});
