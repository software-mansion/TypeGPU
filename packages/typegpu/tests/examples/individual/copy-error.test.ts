/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('copy error example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'tests',
        name: 'copy-error',
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "
          struct Item {
            vec: vec3u,
            num: u32,
          }

          @group(0) @binding(0) var<storage, read> sourceBuffer: Item;
          @group(0) @binding(1) var<storage, read_write> targetBuffer: Item;

          @compute @workgroup_size(1) fn computeShader_0(@builtin(global_invocation_id) gid: vec3u){
            var item = sourceBuffer;
            targetBuffer = item;
          }
          "
    `);
  });
});
