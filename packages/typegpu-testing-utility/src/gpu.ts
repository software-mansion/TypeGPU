import { create, globals } from 'webgpu';
import { test as base } from 'vitest';
import { tgpu } from 'typegpu';

Object.assign(globalThis, globals);

// dawn.node tears Dawn down when the object returned by `create` is garbage collected, which
// crashes the process, so it has to stay referenced for the whole lifetime of the worker.
(globalThis as { __gpu?: unknown }).__gpu = create([]);

export interface GpuContext {
  adapter: GPUAdapter;
  device: GPUDevice;
  hasF16: boolean;
  /** `vendor / architecture / device / description`, for logs and the identity check */
  adapterSummary: string;
}

let gpuPromise: Promise<GpuContext> | undefined;

async function initGpu(): Promise<GpuContext> {
  const gpu = (globalThis as unknown as { __gpu: GPU }).__gpu;
  const adapter = await gpu.requestAdapter();
  if (!adapter) {
    throw new Error('navigator.gpu.requestAdapter() returned null: no WebGPU backend available');
  }

  const info = adapter.info;
  const adapterSummary = [info.vendor, info.architecture, info.device, info.description]
    .filter(Boolean)
    .join(' / ');

  // CI pins the backend (e.g. TGPU_GPU_EXPECT=llvmpipe) so that a silent fallback to another
  // adapter fails loudly instead of changing what the tests mean.
  const expected = process.env.TGPU_GPU_EXPECT;
  if (expected && !adapterSummary.toLowerCase().includes(expected.toLowerCase())) {
    throw new Error(`Expected a "${expected}" adapter, got: ${adapterSummary}`);
  }

  const hasF16 = adapter.features.has('shader-f16');
  const device = await adapter.requestDevice({
    requiredFeatures: hasF16 ? (['shader-f16'] as GPUFeatureName[]) : [],
  });
  void device.lost.then((lost) => {
    console.error(`GPU device lost: ${lost.reason}: ${lost.message}`);
  });

  console.info(`[gpu] adapter: ${adapterSummary}; shader-f16: ${hasF16}`);
  return { adapter, device, hasF16, adapterSummary };
}

/**
 * Like `it` from `typegpu-testing-utility`, but runs against a real WebGPU device
 * (dawn.node). Use together with a `vitest.gpu.config.mts`, never in the mock-based suite.
 */
export const gpuIt = base
  .extend('gpu', async () => await (gpuPromise ??= initGpu()))
  .extend('root', async ({ gpu }, { onCleanup }) => {
    const root = tgpu.initFromDevice({ device: gpu.device });
    onCleanup(() => root.destroy());
    return root;
  });
