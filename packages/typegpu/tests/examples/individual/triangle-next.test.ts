/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('triangle (next) example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'triangle-next',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "const pos: array<vec2f, 3> = array<vec2f, 3>(vec2f(0, 0.5), vec2f(-0.5), vec2f(0.5, -0.5));

      const uv: array<vec2f, 3> = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(vec4f(pos[_arg_0.vertexIndex], 0f, 1f), uv[_arg_0.vertexIndex]);
      }

      fn getGradientColor(ratio: f32) -> vec4f {
        return mix(vec4f(0.7689999938011169, 0.3919999897480011, 1, 1), vec4f(0.11400000005960464, 0.44699999690055847, 0.9409999847412109, 1), ratio);
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        return getGradientColor(((_arg_0.uv.x + _arg_0.uv.y) / 2f));
      }"
    `);
  });
});
