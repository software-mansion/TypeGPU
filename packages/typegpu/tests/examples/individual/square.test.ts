/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('square example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'square',
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertex_Input_1 {
        @builtin(vertex_index) idx: u32,
        @location(0) color: vec4f,
      }

      struct vertex_Output_2 {
        @location(0) color: vec4f,
        @builtin(position) pos: vec4f,
      }

      @vertex fn vertex_0(_arg_0: vertex_Input_1) -> vertex_Output_2 {
        var vertices = array<vec2f, 4>(vec2f(-1, -1), vec2f(1, -1), vec2f(1), vec2f(-1, 1));
        return vertex_Output_2(_arg_0.color, vec4f(vertices[_arg_0.idx], 0, 1));
      }

      struct mainFragment_Input_4 {
        @location(0) color: vec4f,
      }

      @fragment fn mainFragment_3(input: mainFragment_Input_4) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });
});
