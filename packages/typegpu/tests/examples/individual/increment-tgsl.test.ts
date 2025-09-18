/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('increment tgsl example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'increment-tgsl',
      controlTriggers: ['Increment'],
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> counter_1: vec3f;

      struct increment_Input_2 {
        @builtin(num_workgroups) num: vec3u,
      }

      @compute @workgroup_size(1) fn increment_0(input: increment_Input_2) {
        var tmp = counter_1.x;
        counter_1.x = counter_1.y;
        counter_1.y += tmp;
        counter_1.z += f32(input.num.x);
      }"
    `);
  });
});
