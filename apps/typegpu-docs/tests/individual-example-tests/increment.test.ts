/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('increment example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simple',
        name: 'increment',
        controlTriggers: ['Increment'],
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> counter: u32;

      fn wrappedCallback(_arg_0: u32, _arg_1: u32, _arg_2: u32) {
        counter += 1u;
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u)  {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
      }"
    `);
  });
});
