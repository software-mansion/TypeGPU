/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('sort example', () => {
  setupCommonMocks();

  it('resolves the sort and render pipelines', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'sort',
        controlTriggers: ['Sort'],
        expectedCalls: 6,
      },
      device,
    );

    expect({
      copyPad: shaderCodes.includes('@compute @workgroup_size(256) fn copyPadKernel'),
      localSort: shaderCodes.includes('@compute @workgroup_size(256) fn localSortKernel'),
      globalStep: shaderCodes.includes('@compute @workgroup_size(256) fn bitonicStepKernel'),
      render: shaderCodes.includes('@fragment fn fragmentFn'),
    }).toMatchInlineSnapshot(`
      {
        "copyPad": true,
        "globalStep": true,
        "localSort": true,
        "render": true,
      }
    `);
  });
});
