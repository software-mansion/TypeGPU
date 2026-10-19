/**
 * @vitest-environment jsdom
 */

import { assert, describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('radiance cascades drawing example', () => {
  setupCommonMocks();

  it('initializes and renders a scene update', async ({ device }) => {
    const frames = vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);

    await runExampleTest(
      {
        category: 'rendering',
        name: 'radiance-cascades-drawing',
        controlTriggers: ['Clear'],
      },
      device,
    );

    const frame = frames.mock.calls[0]?.[0];
    assert(frame);
    expect(() => frame(0)).not.toThrow();

    const example = await import('../../src/examples/rendering/radiance-cascades-drawing/index.ts');
    example.onCleanup();
  });
});
