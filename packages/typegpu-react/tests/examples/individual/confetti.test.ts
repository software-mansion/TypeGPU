/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('react/confetti example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        name: 'confetti',
        setupMocks: mockResizeObserver,
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot();
  });
});
