/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

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

      @vertex fn vertex(@builtin(vertex_index) idx: u32, @location(0) color: vec4f) -> vertex_Output {
        let vertices = array<vec2f, 4>(vec2f(-1), vec2f(1, -1), vec2f(1), vec2f(-1, 1));
        return vertex_Output(color, vec4f(vertices[idx], 0f, 1f));
      }

      struct mainFragment_Input {
        @location(0) color: vec4f,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        return _arg_0.color;
      }"
    `);
  });
});
