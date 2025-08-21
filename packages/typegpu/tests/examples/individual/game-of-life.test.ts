/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('game of life example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'game-of-life',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> size_0: vec2u;

      @group(0) @binding(1) var<storage, read> current_1: array<u32>;

      @group(0) @binding(2) var<storage, read_write> next_2: array<u32>;
      override blockSize = 8;

      fn getIndex(x: u32, y: u32) -> u32 {
        let h = size_0.y;
        let w = size_0.x;

        return (y % h) * w + (x % w);
      }

      fn getCell(x: u32, y: u32) -> u32 {
        return current_1[getIndex(x, y)];
      }

      fn countNeighbors(x: u32, y: u32) -> u32 {
        return getCell(x - 1, y - 1) + getCell(x, y - 1) + getCell(x + 1, y - 1) +
               getCell(x - 1, y) +                         getCell(x + 1, y) +
               getCell(x - 1, y + 1) + getCell(x, y + 1) + getCell(x + 1, y + 1);
      }

      @compute @workgroup_size(blockSize, blockSize)
      fn main(@builtin(global_invocation_id) grid: vec3u) {
        let x = grid.x;
        let y = grid.y;
        let n = countNeighbors(x, y);
        next_2[getIndex(x, y)] = select(u32(n == 3u), u32(n == 2u || n == 3u), getCell(x, y) == 1u);
      }


      @group(0) @binding(0) var<uniform> size_0: vec2u;
      struct Out {
        @builtin(position) pos: vec4f,
        @location(0) cell: f32,
        @location(1) uv: vec2f,
      }

      @vertex
      fn vert(@builtin(instance_index) i: u32, @location(0) cell: u32, @location(1) pos: vec2u) -> Out {
        let w = size_0.x;
        let h = size_0.y;
        let x = (f32(i % w + pos.x) / f32(w) - 0.5) * 2. * f32(w) / f32(max(w, h));
        let y = (f32((i - (i % w)) / w + pos.y) / f32(h) - 0.5) * 2. * f32(h) / f32(max(w, h));

        return Out(
          vec4f(x, y, 0., 1.),
          f32(cell),
          vec2f((x + 1) / 2, (y + 1) / 2)
        );
      }

      @fragment
      fn frag(@location(0) cell: f32, @builtin(position) pos: vec4f, @location(1) uv: vec2f) -> @location(0) vec4f {
        if (cell == 0.) {
          discard;
        }

        return vec4f(
          uv.x / 1.5,
          uv.y / 1.5,
          1 - uv.x / 1.5,
          0.8
        );
      }"
    `);
  });
});
