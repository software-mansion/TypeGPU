import { it as base, vi } from 'vitest';
import { type ExperimentalTgpuRoot, tgpu } from '../../src/experimental';
import './webgpuGlobals';

const mockBuffer = {
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
  destroy: vi.fn(),
};

const mockTexture = {
  createView: vi.fn(() => 'view'),
};

const mockCommandEncoder = {
  beginComputePass: vi.fn(() => mockComputePassEncoder),
  beginRenderPass: vi.fn(() => mockRenderPassEncoder),
  copyBufferToBuffer: vi.fn(),
  copyBufferToTexture: vi.fn(),
  copyTextureToBuffer: vi.fn(),
  copyTextureToTexture: vi.fn(),
  finish: vi.fn(),
};

const mockComputePassEncoder = {
  dispatchWorkgroups: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
};

const mockRenderPassEncoder = {
  draw: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
};

const mockDevice = {
  createBindGroup: vi.fn(
    (_descriptor: GPUBindGroupDescriptor) => 'mockBindGroup',
  ),
  createBindGroupLayout: vi.fn(
    (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
  ),
  createBuffer: vi.fn(() => mockBuffer),
  createCommandEncoder: vi.fn(() => mockCommandEncoder),
  createComputePipeline: vi.fn(() => 'mockComputePipeline'),
  createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
  createRenderPipeline: vi.fn(() => 'mockRenderPipeline'),
  createSampler: vi.fn(() => 'mockSampler'),
  createShaderModule: vi.fn(() => 'mockShaderModule'),
  createTexture: vi.fn(() => mockTexture),
  importExternalTexture: vi.fn(() => 'mockExternalTexture'),
  queue: {
    copyExternalImageToTexture: vi.fn(),
    onSubmittedWorkDone: vi.fn(),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
  },
};

export const it = base.extend<{
  root: ExperimentalTgpuRoot & { mockDevice: typeof mockDevice };
}>({
  root: async ({ task }, use) => {
    vi.restoreAllMocks();

    // setup
    const root = tgpu.initFromDevice({
      device: mockDevice as unknown as GPUDevice,
    }) as ExperimentalTgpuRoot & { mockDevice: typeof mockDevice };

    root.mockDevice = mockDevice;

    await use(root);

    // teardown
    root.destroy();
  },
});
