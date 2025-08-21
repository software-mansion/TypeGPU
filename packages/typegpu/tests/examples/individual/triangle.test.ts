/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('triangle example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'triangle',
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainVertex_Input_1 {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct mainVertex_Output_2 {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn mainVertex_0(in: mainVertex_Input_1) -> mainVertex_Output_2 {
        var pos = array<vec2f, 3>(
          vec2(0.0, 0.5),
          vec2(-0.5, -0.5),
          vec2(0.5, -0.5)
        );

        var uv = array<vec2f, 3>(
          vec2(0.5, 1.0),
          vec2(0.0, 0.0),
          vec2(1.0, 0.0),
        );

        return mainVertex_Output_2(vec4f(pos[in.vertexIndex], 0.0, 1.0), uv[in.vertexIndex]);
      }

      fn getGradientColor_4(ratio: f32) -> vec4f{
        return mix(vec4f(0.7689999938011169, 0.3919999897480011, 1, 1), vec4f(0.11400000005960464, 0.44699999690055847, 0.9409999847412109, 1), ratio);
      }


      struct mainFragment_Input_5 {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment_3(in: mainFragment_Input_5) -> @location(0)  vec4f {
        return getGradientColor_4((in.uv[0] + in.uv[1]) / 2);
      }
      "
    `);
  });
});
