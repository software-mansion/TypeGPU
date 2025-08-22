/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('gradient tiles example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'gradient-tiles',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Span_1 {
        x: u32,
        y: u32,
      }

      @group(0) @binding(0) var<uniform> span_0: Span_1;
          struct VertexOutput {
            @builtin(position) pos: vec4f,
            @location(0) uv: vec2f,
          }

          @vertex
          fn main_vertex(
            @builtin(vertex_index) vertexIndex: u32,
          ) -> VertexOutput {
            var pos = array<vec2f, 4>(
              vec2(1, 1), // top-right
              vec2(-1, 1), // top-left
              vec2(1, -1), // bottom-right
              vec2(-1, -1) // bottom-left
            );
            var out: VertexOutput;
            out.pos = vec4f(pos[vertexIndex], 0.0, 1.0);
            out.uv = (pos[vertexIndex] + 1) * 0.5;
            return out;
          }

          @fragment
          fn main_fragment(
            @location(0) uv: vec2f,
          ) -> @location(0) vec4f {
            let red = floor(uv.x * f32(span_0.x)) / f32(span_0.x);
            let green = floor(uv.y * f32(span_0.y)) / f32(span_0.y);
            return vec4(red, green, 0.5, 1.0);
          }
        "
    `);
  });
});
