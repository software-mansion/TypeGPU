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
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertex_Input_1 {
        @location(0) position: vec4f,
        @location(1) color: vec4f,
      }

      struct vertex_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) color: vec4f,
      }

      struct Camera_4 {
        view: mat4x4f,
        projection: mat4x4f,
      }

      @group(0) @binding(0) var<uniform> camera_3: Camera_4;

      struct Transform_6 {
        model: mat4x4f,
      }

      @group(0) @binding(1) var<uniform> transform_5: Transform_6;

      @vertex fn vertex_0(input: vertex_Input_1) -> vertex_Output_2 {
        var pos = (camera_3.projection * (camera_3.view * (transform_5.model * input.position)));
        return vertex_Output_2(pos, input.color);
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
