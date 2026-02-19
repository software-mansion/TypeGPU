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
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      fn getIndex(x: u32, y: u32) -> u32 {
        return (((y % 64u) * 64u) + (x % 64u));
      }

      @group(1) @binding(0) var<storage, read> current: array<u32>;

      fn getCell(x: u32, y: u32) -> u32 {
        return current[getIndex(x, y)];
      }

      fn countNeighbors(x: u32, y: u32) -> u32 {
        return (((((((getCell((x - 1u), (y - 1u)) + getCell(x, (y - 1u))) + getCell((x + 1u), (y - 1u))) + getCell((x - 1u), y)) + getCell((x + 1u), y)) + getCell((x - 1u), (y + 1u))) + getCell(x, (y + 1u))) + getCell((x + 1u), (y + 1u)));
      }

      @group(1) @binding(1) var<storage, read_write> next: array<u32>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let n = countNeighbors(x, y);
        next[getIndex(x, y)] = u32(select((n == 3u), ((n == 2u) || (n == 3u)), (getCell(x, y) == 1u)));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      struct vertexFn_Output {
        @builtin(position) pos: vec4f,
        @location(0) @interpolate(flat) cell: u32,
        @location(1) uv: vec2f,
      }

      struct vertexFn_Input {
        @builtin(instance_index) iid: u32,
        @location(0) cell: u32,
        @location(1) pos: vec2u,
      }

      @vertex fn vertexFn(_arg_0: vertexFn_Input) -> vertexFn_Output {
        const w = 64u;
        const h = 64u;
        let col = (_arg_0.iid % w);
        let row = u32((f32(_arg_0.iid) / f32(w)));
        let gx = (col + _arg_0.pos.x);
        let gy = (row + _arg_0.pos.y);
        let maxWH = f32(max(w, h));
        let x = (((f32(gx) * 2f) - f32(w)) / maxWH);
        let y = (((f32(gy) * 2f) - f32(h)) / maxWH);
        return vertexFn_Output(vec4f(x, y, 0f, 1f), _arg_0.cell, vec2f(((x + 1f) * 0.5f), ((y + 1f) * 0.5f)));
      }

      struct fragmentFn_Input {
        @location(0) @interpolate(flat) cell: u32,
        @location(1) uv: vec2f,
      }

      @fragment fn fragmentFn(_arg_0: fragmentFn_Input) -> @location(0) vec4f {
        if ((_arg_0.cell == 0u)) {
          discard;;
        }
        var u = (_arg_0.uv / 1.5f);
        return vec4f(u.x, u.y, (1f - u.x), 0.8f);
      }"
    `);
  });
});
