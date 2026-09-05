/**
 * @vitest-environment jsdom
 */

import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { Spring } from '../../src/examples/rendering/jelly-knob/spring.ts';
import { setupCommonMocks, mockResizeObserver } from './utils/commonMocks.ts';

describe('jelly knob spring', () => {
  it('converges at both normal and slow frame rates', () => {
    for (const dt of [1 / 120, 1 / 60, 0.1]) {
      const spring = new Spring({ mass: 4, stiffness: 700, damping: 50 });
      spring.target = 1;
      for (let time = 0; time < 10; time += dt) {
        spring.update(dt);
        expect(Math.abs(spring.value)).toBeLessThan(2);
      }
      expect(spring.value).toBeCloseTo(1, 5);
    }
  });

  it('advances the full elapsed time across a slow frame', () => {
    const slow = new Spring({ mass: 4, stiffness: 700, damping: 50 });
    const fast = new Spring(slow.properties);
    slow.target = fast.target = 1;
    slow.update(0.1);
    for (let i = 0; i < 12; i++) fast.update(1 / 120);
    expect(slow.value).toBeCloseTo(fast.value, 10);
  });
});

describe('jelly knob resource lifecycle', () => {
  setupCommonMocks();

  it('releases textures on quality changes and removes its global listener on cleanup', async ({
    device,
  }) => {
    mockResizeObserver();
    const requestFrame = vi.fn<(callback: FrameRequestCallback) => number>(() => 1);
    vi.stubGlobal('requestAnimationFrame', requestFrame);
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const addListener = vi.spyOn(window, 'addEventListener');
    const removeListener = vi.spyOn(window, 'removeEventListener');
    document.body.innerHTML = '<canvas></canvas>';

    const example = await import('../../src/examples/rendering/jelly-knob/index.ts');
    const renderFrame = () => requestFrame.mock.calls.at(-1)?.[0](performance.now());
    const createdTextures = () =>
      device.mock.createTexture.mock.results.map((result) => result.value);

    try {
      renderFrame();
      const textureCount = createdTextures().length;
      const shaderCount = device.mock.createShaderModule.mock.calls.length;
      const darkMode = example.controls['Dark Mode'];
      for (const dark of [true, false]) {
        if (darkMode && 'onToggleChange' in darkMode) darkMode.onToggleChange(dark);
        renderFrame();
        expect(createdTextures()).toHaveLength(textureCount);
        expect(device.mock.createShaderModule).toHaveBeenCalledTimes(shaderCount);
      }
      for (const quality of ['Low', 'Ultra'] as const) {
        const previousTextures = createdTextures();
        expect(previousTextures.length).toBeGreaterThan(0);
        const control = example.controls.Quality;
        if (control && 'onSelectChange' in control) control.onSelectChange(quality);
        for (const texture of previousTextures) {
          expect(texture.destroy).toHaveBeenCalledOnce();
        }
        renderFrame();
      }
    } finally {
      example.onCleanup();
    }

    for (const texture of createdTextures()) {
      expect(texture.destroy).toHaveBeenCalledOnce();
    }
    const mouseUp = addListener.mock.calls.find(([event]) => event === 'mouseup');
    expect(mouseUp).toBeDefined();
    expect(removeListener).toHaveBeenCalledWith('mouseup', mouseUp?.[1]);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    vi.restoreAllMocks();
  });
});
