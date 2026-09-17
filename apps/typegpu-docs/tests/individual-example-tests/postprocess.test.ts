/**
 * @vitest-environment jsdom
 */
import { assert, describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { setupCommonMocks } from './utils/baseTest.ts';
import html from '../../src/examples/image-processing/postprocess/index.html?raw';

describe('postprocess example', () => {
  setupCommonMocks();

  it('fuses effects, rebuilds for resize and blur changes, and reuses shaders for grading', async ({
    device,
  }) => {
    document.body.innerHTML = html;
    const stop = vi.fn();
    const cameraStream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(cameraStream);
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    let frame: VideoFrameRequestCallback | undefined;
    const requestFrame = vi.fn((callback: VideoFrameRequestCallback) => {
      frame = callback;
      return 1;
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', {
      value: requestFrame,
      configurable: true,
    });
    const cancelFrame = vi.fn();
    Object.defineProperty(HTMLVideoElement.prototype, 'cancelVideoFrameCallback', {
      value: cancelFrame,
      configurable: true,
    });
    let videoWidth = 640;
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      get: () => videoWidth,
      configurable: true,
    });
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      get: () => 480,
      configurable: true,
    });
    const example = await import('../../src/examples/image-processing/postprocess/index.ts');
    const status = document.querySelector('[data-pass-count]');
    assert(example.controls.Input && 'onSelectChange' in example.controls.Input);
    // defineControls erases the Promise return type of select handlers.
    const selectInput = example.controls.Input.onSelectChange as (
      value: 'Procedural' | 'Camera',
    ) => Promise<void>;
    expect(example.controls.Input.initial).toBe('Procedural');
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(status?.textContent).toBe('3 effects → 2 post-processing passes · 960 × 600');
    const shaderCount = device.mock.createShaderModule.mock.calls.length;
    const textureCount = device.mock.createTexture.mock.calls.length;
    assert(example.controls.Radius && 'onSliderChange' in example.controls.Radius);
    example.controls.Radius.onSliderChange(6);
    expect(device.mock.createTexture.mock.calls).toHaveLength(textureCount);
    assert(example.controls.Exposure && 'onSliderChange' in example.controls.Exposure);
    example.controls.Exposure.onSliderChange(2);
    assert(example.controls.Saturation && 'onSliderChange' in example.controls.Saturation);
    example.controls.Saturation.onSliderChange(0.5);
    assert(
      example.controls['Before / after'] && 'onSliderChange' in example.controls['Before / after'],
    );
    example.controls['Before / after'].onSliderChange(0.7);
    expect(device.mock.createShaderModule.mock.calls.length).toBe(shaderCount);
    assert(
      example.controls['Half resolution'] &&
        'onToggleChange' in example.controls['Half resolution'],
    );
    example.controls['Half resolution'].onToggleChange(true);
    expect(status?.textContent).toBe('4 effects → 3 post-processing passes · 480 × 300');
    assert(example.controls.Blur && 'onSelectChange' in example.controls.Blur);
    example.controls.Blur.onSelectChange('Box');
    assert(example.controls.Method && 'onSelectChange' in example.controls.Method);
    example.controls.Method.onSelectChange('Single pass');
    expect(status?.textContent).toBe('4 effects → 2 post-processing passes · 480 × 300');
    assert(example.controls.Radius && 'onSliderChange' in example.controls.Radius);
    example.controls.Radius.onSliderChange(5);
    assert(
      example.controls['Tone mapping'] && 'onSelectChange' in example.controls['Tone mapping'],
    );
    example.controls['Tone mapping'].onSelectChange('Reinhard');
    assert(
      example.controls['Tone mapping'] && 'onSelectChange' in example.controls['Tone mapping'],
    );
    example.controls['Tone mapping'].onSelectChange('Exponential');
    assert(example.controls.Blur && 'onSelectChange' in example.controls.Blur);
    example.controls.Blur.onSelectChange('None');
    expect(status?.textContent).toBe('3 effects → 1 post-processing pass · 480 × 300');
    const shaders = vi
      .mocked(device.createShaderModule)
      .mock.calls.map(([descriptor]) => descriptor.code)
      .join('\n');
    expect(shaders).toContain('textureLoad');
    expect(shaders).toContain('exp(');
    example.controls.Blur.onSelectChange('Bokeh');
    expect(status?.textContent).toBe('4 effects → 2 post-processing passes · 480 × 300');
    const bokehShaders = device.mock.createShaderModule.mock.calls.length;
    example.controls.Radius.onSliderChange(4);
    expect(device.mock.createShaderModule.mock.calls).toHaveLength(bokehShaders);
    example.controls.Blur.onSelectChange('Gaussian');
    example.controls.Method.onSelectChange('Separable');
    // Camera frames are imported afresh, while unchanged dimensions reuse textures and shaders.
    await selectInput('Camera');
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: false,
      video: {
        width: { ideal: 960 },
        height: { ideal: 600 },
        facingMode: 'user',
      },
    });
    expect(document.querySelector('[data-source-label]')?.textContent).toContain('Original camera');
    expect(status?.textContent).toContain('320 × 240');
    const cameraTextures = device.mock.createTexture.mock.calls.length;
    const cameraShaders = device.mock.createShaderModule.mock.calls.length;
    const imports = vi.mocked(device.importExternalTexture).mock.calls.length;
    assert(frame);
    frame(0, {} as VideoFrameCallbackMetadata);
    expect(vi.mocked(device.importExternalTexture).mock.calls.length).toBe(imports + 1);
    expect(device.mock.createTexture.mock.calls).toHaveLength(cameraTextures);
    expect(device.mock.createShaderModule.mock.calls).toHaveLength(cameraShaders);
    videoWidth = 800;
    frame(1, {} as VideoFrameCallbackMetadata);
    expect(status?.textContent).toContain('400 × 240');
    await selectInput('Procedural');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalled();
    expect(status?.textContent).toContain('480 × 300');

    getUserMedia.mockRejectedValueOnce(new Error('Permission denied'));
    await selectInput('Camera');
    expect(document.querySelector('[data-camera-status]')?.textContent).toContain(
      'Permission denied',
    );
    expect(status?.textContent).toContain('480 × 300');

    // An outstanding permission request must not restart a camera after switching back.
    let resolveCamera!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValueOnce(
      new Promise<MediaStream>((resolve) => {
        resolveCamera = resolve;
      }),
    );
    const pending = selectInput('Camera');
    await selectInput('Procedural');
    resolveCamera(cameraStream);
    await pending;
    expect(stop).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[data-source-label]')?.textContent).toContain('Original HDR');

    await selectInput('Camera');
    example.onCleanup();
    expect(stop).toHaveBeenCalledTimes(3);
    expect(device.destroy).toHaveBeenCalled();
  });
});
