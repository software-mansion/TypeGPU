/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('square example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'square',
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct vertex_Output {
        @location(0) color: vec4f,
        @builtin(position) pos: vec4f,
      }

      struct vertex_Input {
        @builtin(vertex_index) idx: u32,
        @location(0) color: vec4f,
      }

      @vertex fn vertex(_arg_0: vertex_Input) -> vertex_Output {
        var vertices = array<vec2f, 4>(vec2f(-1), vec2f(1, -1), vec2f(1), vec2f(-1, 1));
        return vertex_Output(_arg_0.color, vec4f(vertices[_arg_0.idx], 0f, 1f));
      }

      struct mainFragment_Input {
        @location(0) color: vec4f,
      }

      @fragment fn mainFragment(input: mainFragment_Input) -> @location(0) vec4f {
        return input.color;
      }"
    `);
  });
});
