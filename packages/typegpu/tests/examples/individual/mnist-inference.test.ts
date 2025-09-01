/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockMnistWeights } from '../utils/commonMocks.ts';

describe('mnist inference example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'algorithms',
      name: 'mnist-inference',
      setupMocks: mockMnistWeights,
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`""`);
  });
});
