/**
 * @vitest-environment jsdom
 */

import { expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { demos, defaultParams } from '../../src/components/geometry/demos.ts';
import { createMeshViewer } from '../../src/components/geometry/viewer.ts';
import { setupCommonMocks } from './utils/commonMocks.ts';

setupCommonMocks();

it('does not submit a pending bake with destroyed uniforms after disposal', async ({ device }) => {
  document.body.innerHTML = '<canvas></canvas>';
  let frame: FrameRequestCallback = () => {};
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());

  const compilation = Promise.withResolvers<void>();
  const initialize = device.mock.createComputePipelineAsync.getMockImplementation()!;
  device.mock.createComputePipelineAsync.mockImplementation(async (descriptor) => {
    await compilation.promise;
    return initialize(descriptor);
  });

  const viewer = await createMeshViewer(document.querySelector('canvas')!);
  try {
    viewer.show(demos.ripple, defaultParams(demos.ripple));
    frame(1);
    await vi.waitFor(() => expect(device.mock.createComputePipelineAsync).toHaveBeenCalledTimes(2));

    const uniforms = device.mock.createBuffer.mock.results.find(
      ({ value }) => (value.usage & GPUBufferUsage.UNIFORM) !== 0,
    )!.value;
    let submittedWithDestroyedUniforms = false;
    device.mock.queue.submit.mockImplementation(() => {
      submittedWithDestroyedUniforms ||= uniforms.destroy.mock.calls.length > 0;
    });

    viewer.destroy();
    compilation.resolve();
    await vi.waitFor(() => expect(device.mock.queue.submit).toHaveBeenCalledOnce());

    expect(submittedWithDestroyedUniforms).toBe(false);
    expect(uniforms.destroy).toHaveBeenCalledOnce();
  } finally {
    compilation.resolve();
    viewer.destroy();
  }
});
