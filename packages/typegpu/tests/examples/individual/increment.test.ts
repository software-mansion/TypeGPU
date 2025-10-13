/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('increment example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'increment',
      controlTriggers: ['Increment'],
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      const offset_4: vec3f = vec3f(1, 2, 3);

      @group(0) @binding(1) var<storage, read_write> counter_5: f32;

      fn foo_3() {
        let off = (&offset_4);
        counter_5 += (*off).x;
      }

      fn wrappedCallback_2(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        foo_3();
      }

      struct mainCompute_Input_6 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute_0(in: mainCompute_Input_6)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
