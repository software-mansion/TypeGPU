/**
 * @vitest-environment jsdom
 */

import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';
import { extractShaderCodes } from './utils/testUtils.ts';

describe('Three.js resource bridge example', () => {
  setupCommonMocks();

  it('generates valid shaders for every bridged resource category', async ({ device }) => {
    Object.defineProperty(device, 'lost', {
      value: new Promise<GPUDeviceLostInfo>(() => {}),
    });
    Object.assign(device, {
      pushErrorScope: vi.fn(),
      popErrorScope: vi.fn(async () => null),
    });
    mockResizeObserver();
    vi.stubGlobal(
      'ImageBitmap',
      class ImageBitmapMock {
        readonly mock = true;
      },
    );
    vi.stubGlobal(
      'VideoFrame',
      class VideoFrameMock {
        readonly mock = true;
      },
    );
    document.body.innerHTML = '<canvas></canvas>';

    const example = await import('../../src/examples/threejs/resource-bridge/index.ts');
    const shaderCodes = extractShaderCodes(device);
    example.onCleanup();

    expect(shaderCodes).toContain('@vertex');
    expect(shaderCodes).toContain('@fragment');
    expect(shaderCodes).toContain('var<storage, read>');
    expect(shaderCodes).toContain('var<uniform>');
    expect(shaderCodes).toContain('texture_2d<f32>');
    expect(shaderCodes).toContain('bridgeWeight');
    expect(shaderCodes).toContain('vResourceBridgeSignal');
    expect(shaderCodes).toContain('var<private>');
  });
});
