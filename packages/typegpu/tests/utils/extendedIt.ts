import { it as base, vi } from 'vitest';
import type { ExperimentalTgpuRoot } from '../../src/core/root/rootTypes.ts';
import tgpu from '../../src/index.js';
// oxlint-disable-next-line import/no-unassigned-import imported for side effects
import './webgpuGlobals.ts';

const adapterMock = {
  features: new Set(['timestamp-query']),
  requestDevice: vi.fn((descriptor) => Promise.resolve(mockDevice)),
  limits: {
    maxStorageBufferBindingSize: 64 * 1024 * 1024,
  },
};

const navigatorMock = {
  gpu: {
    __brand: 'GPU',
    requestAdapter: vi.fn(() => Promise.resolve(adapterMock)),
    getPreferredCanvasFormat: vi.fn(() => 'bgra8unorm'),
  },
  mediaDevices: {
    getUserMedia: vi.fn(() => Promise.resolve()),
  },
};

const mockTexture = (descriptor: GPUTextureDescriptor) => ({
  ...descriptor,
  with: (descriptor.size as number[])[0] ?? 1,
  height: (descriptor.size as number[])[1] ?? 1,
  depthOrArrayLayers: (descriptor.size as number[])[2] ?? 1,
  createView: vi.fn(() => 'view'),
  destroy: vi.fn(),
});

const mockCommandEncoder = {
  get mock() {
    return mockCommandEncoder;
  },
  beginComputePass: vi.fn(() => mockComputePassEncoder),
  beginRenderPass: vi.fn(() => mockRenderPassEncoder),
  clearBuffer: vi.fn(),
  copyBufferToBuffer: vi.fn(),
  copyBufferToTexture: vi.fn(),
  copyTextureToBuffer: vi.fn(),
  copyTextureToTexture: vi.fn(),
  resolveQuerySet: vi.fn(),
  finish: vi.fn(),
};

const mockComputePassEncoder = {
  dispatchWorkgroups: vi.fn(),
  dispatchWorkgroupsIndirect: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
};

const mockRenderPassEncoder = {
  draw: vi.fn(),
  drawIndexed: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  setStencilReference: vi.fn(),
  executeBundles: vi.fn(),
};

const mockRenderBundleEncoder = {
  draw: vi.fn(),
  drawIndexed: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
  setVertexBuffer: vi.fn(),
  setIndexBuffer: vi.fn(),
  finish: vi.fn(() => 'mockRenderBundle'),
  label: '<unnamed>',
};

const mockQuerySet = {
  destroy: vi.fn(),
  get label() {
    return this._label || '<unnamed>';
  },
  set label(value) {
    this._label = value;
  },
  _label: '<unnamed>',
};

const mockComputePipeline = {
  get getBindGroupLayout() {
    return vi.fn(() => 'mockBindGroupLayout');
  },
  label: '<unnamed>',
};

const mockDevice = {
  get mock() {
    return mockDevice;
  },
  features: new Set(['timestamp-query']),
  createBindGroup: vi.fn(
    (_descriptor: GPUBindGroupDescriptor) => 'mockBindGroup',
  ),
  createBindGroupLayout: vi.fn(
    (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
  ),
  createBuffer: vi.fn(
    ({ size, usage, mappedAtCreation, label }: GPUBufferDescriptor) => {
      const mockBuffer = {
        mapState: mappedAtCreation ? 'mapped' : 'unmapped',
        size,
        usage,
        label: label ?? '<unnamed>',
        getMappedRange: vi.fn(() => new ArrayBuffer(size)),
        unmap: vi.fn(() => {
          mockBuffer.mapState = 'unmapped';
        }),
        mapAsync: vi.fn(() => {
          mockBuffer.mapState = 'mapped';
        }),
        destroy: vi.fn(),
      };

      return mockBuffer;
    },
  ),
  createCommandEncoder: vi.fn(() => mockCommandEncoder),
  createComputePipeline: vi.fn(() => mockComputePipeline),
  createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
  createQuerySet: vi.fn(
    ({ type, count }: GPUQuerySetDescriptor) => {
      const querySet = Object.create(mockQuerySet);
      querySet.type = type;
      querySet.count = count;
      querySet._label = '<unnamed>';
      return querySet;
    },
  ),
  createRenderPipeline: vi.fn(() => 'mockRenderPipeline'),
  createSampler: vi.fn(() => 'mockSampler'),
  createShaderModule: vi.fn(() => 'mockShaderModule'),
  createTexture: vi.fn((descriptor) => mockTexture(descriptor)),
  importExternalTexture: vi.fn(() => 'mockExternalTexture'),
  queue: {
    copyExternalImageToTexture: vi.fn(),
    onSubmittedWorkDone: vi.fn(() => Promise.resolve()),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
  },
  limits: {
    maxUniformBuffersPerShaderStage: 12,
    maxStorageBuffersPerShaderStage: 8,
  },
  destroy: vi.fn(),
};

export const it = base.extend<{
  _global: undefined;
  commandEncoder: GPUCommandEncoder & { mock: typeof mockCommandEncoder };
  device: GPUDevice & { mock: typeof mockDevice };
  renderBundleEncoder: GPURenderBundleEncoder;
  root: ExperimentalTgpuRoot;
}>({
  _global: [
    async ({ task }, use) => {
      vi.stubGlobal('navigator', navigatorMock);

      await use(undefined);

      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    },
    { auto: true }, // Always runs
  ],

  commandEncoder: async ({ task }, use) => {
    await use(
      mockCommandEncoder as unknown as GPUCommandEncoder & {
        mock: typeof mockCommandEncoder;
      },
    );
  },

  renderBundleEncoder: async ({ task }, use) => {
    await use(
      mockRenderBundleEncoder as unknown as GPURenderBundleEncoder,
    );
  },

  device: async ({ task }, use) => {
    await use(mockDevice as unknown as GPUDevice & { mock: typeof mockDevice });
  },

  root: async ({ task }, use) => {
    const root = await tgpu.init();

    await use(root as ExperimentalTgpuRoot);

    root.destroy();
  },
});

export const test = it;
