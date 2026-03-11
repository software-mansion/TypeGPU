/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('stencil example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'stencil',
        expectedCalls: 2,
        setupMocks: mockResizeObserver,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "const vertices: array<vec2f, 3> = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));

      const uvs: array<vec2f, 3> = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));

      @group(0) @binding(0) var<uniform> rotationUniform: mat2x2f;

      struct vertexFn_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexFn_Input {
        @builtin(vertex_index) vid: u32,
      }

      @vertex fn vertexFn(_arg_0: vertexFn_Input) -> vertexFn_Output {
        let pos = vertices[_arg_0.vid];
        let uv = uvs[_arg_0.vid];
        var rotatedPos = (rotationUniform * pos);
        return vertexFn_Output(vec4f(rotatedPos, 0f, 1f), uv);
      }

      const vertices: array<vec2f, 3> = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));

      const uvs: array<vec2f, 3> = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));

      @group(0) @binding(0) var<uniform> rotationUniform: mat2x2f;

      struct vertexFn_Output {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexFn_Input {
        @builtin(vertex_index) vid: u32,
      }

      @vertex fn vertexFn(_arg_0: vertexFn_Input) -> vertexFn_Output {
        let pos = vertices[_arg_0.vid];
        let uv = uvs[_arg_0.vid];
        var rotatedPos = (rotationUniform * pos);
        return vertexFn_Output(vec4f(rotatedPos, 0f, 1f), uv);
      }

      struct fragmentFn_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentFn(_arg_0: fragmentFn_Input) -> @location(0) vec4f {
        return vec4f(_arg_0.uv, 0f, 1f);
      }"
    `);
  });
});
