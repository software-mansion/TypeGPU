/**
 * @vitest-environment jsdom
 */

import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { setupCommonMocks, mockResizeObserver } from './utils/commonMocks.ts';
import { extractShaderCodes } from './utils/testUtils.ts';

describe('cloth mesh example', () => {
  setupCommonMocks();

  it('resolves picking, simulation and rendering', async ({ device }) => {
    mockResizeObserver();
    document.body.innerHTML = '<canvas></canvas>';
    const canvas = document.querySelector('canvas')!;
    canvas.setPointerCapture = vi.fn();
    canvas.hasPointerCapture = vi.fn(() => true);
    canvas.releasePointerCapture = vi.fn();
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 256, 256));
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    const example = await import('../../src/examples/simulation/cloth-mesh/index.ts');
    try {
      frame(1);
      canvas.dispatchEvent(
        Object.assign(new Event('pointerdown'), {
          pointerId: 1,
          isPrimary: true,
          button: 0,
          clientX: 128,
          clientY: 128,
        }),
      );
      frame(17);
      expect(extractShaderCodes(device, 8)).toContain('atomicMin(');
    } finally {
      example.onCleanup();
    }
  });
});
