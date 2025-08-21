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
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct increment_Input_1 {
        @builtin(num_workgroups) num: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> counter_2: vec3f;

      @compute @workgroup_size(1) fn increment_0(input: increment_Input_1) {
        var tmp = counter_2.x;
        counter_2.x = counter_2.y;
        counter_2.y += tmp;
        counter_2.z += f32(input.num.x);
      }"
    `);
  });
});
