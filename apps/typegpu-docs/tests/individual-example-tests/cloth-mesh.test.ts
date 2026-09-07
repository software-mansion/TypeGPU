/**
 * @vitest-environment jsdom
 */

import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { setupClothDrag } from '../../src/examples/simulation/cloth-mesh/drag.ts';
import { setupCommonMocks, mockResizeObserver } from './utils/commonMocks.ts';
import { extractShaderCodes } from './utils/testUtils.ts';

function pointerEvent(type: string, values: Partial<PointerEvent> = {}) {
  return Object.assign(new Event(type), {
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    button: 0,
    clientX: 128,
    clientY: 128,
    ...values,
  });
}

function createCanvas() {
  document.body.innerHTML = '<canvas></canvas>';
  const canvas = document.querySelector('canvas')!;
  canvas.setPointerCapture = vi.fn();
  canvas.hasPointerCapture = vi.fn(() => true);
  canvas.releasePointerCapture = vi.fn();
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 256, 256));
  return canvas;
}

describe('cloth mesh example', () => {
  setupCommonMocks();

  it('releases dragging for pinch gestures and lost capture, and removes its listeners', () => {
    const canvas = createCanvas();
    const onGrab = vi.fn();
    const onRelease = vi.fn();
    const drag = setupClothDrag(canvas, { onGrab, onMove: vi.fn(), onRelease });

    canvas.dispatchEvent(pointerEvent('pointerdown'));
    expect(drag.active).toBe(true);
    canvas.dispatchEvent(pointerEvent('pointerdown', { pointerId: 2, isPrimary: false }));
    expect(drag.active).toBe(false);
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onRelease).toHaveBeenCalledTimes(1);

    canvas.dispatchEvent(pointerEvent('pointerdown'));
    canvas.dispatchEvent(pointerEvent('lostpointercapture'));
    expect(drag.active).toBe(false);
    expect(onRelease).toHaveBeenCalledTimes(2);

    drag.cleanup();
    canvas.dispatchEvent(pointerEvent('pointerdown'));
    expect(onGrab).toHaveBeenCalledTimes(2);
    expect(canvas.style.cursor).toBe('');
  });

  it('resolves GPU picking, simulation, and rendering without reading the vertex buffer', async ({
    device,
  }) => {
    mockResizeObserver();
    const canvas = createCanvas();
    let frame: FrameRequestCallback = () => {};
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const example = await import('../../src/examples/simulation/cloth-mesh/index.ts');
    try {
      frame(1);
      canvas.dispatchEvent(pointerEvent('pointerdown'));
      frame(17);
      const shaders = extractShaderCodes(device);
      expect(shaders).toContain('atomicMin(');
      expect(shaders).toContain('atomicLoad(');
      expect(shaders).toContain('@fragment');
      expect(device.mock.createShaderModule).toHaveBeenCalledTimes(8);
      expect(
        device.mock.createBuffer.mock.results.every(
          ({ value }) => !value.mapAsync.mock.calls.length,
        ),
      ).toBe(true);
    } finally {
      example.onCleanup();
    }
  });
});
