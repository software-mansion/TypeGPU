import { it as base, vi } from 'vitest';
import tgpu from 'typegpu';

// Set up WebGPU globals required by typegpu
global.GPUBufferUsage = {
  MAP_READ: 1,
  MAP_WRITE: 2,
  COPY_SRC: 4,
  COPY_DST: 8,
  INDEX: 16,
  VERTEX: 32,
  UNIFORM: 64,
  STORAGE: 128,
  INDIRECT: 256,
  QUERY_RESOLVE: 512,
};

global.GPUMapMode = {
  READ: 0,
  WRITE: 1,
};

global.GPUTextureUsage = {
  COPY_SRC: 1,
  COPY_DST: 2,
  TEXTURE_BINDING: 4,
  STORAGE_BINDING: 8,
  RENDER_ATTACHMENT: 16,
};

global.GPUShaderStage = {
  VERTEX: 1,
  FRAGMENT: 2,
  COMPUTE: 4,
};

const adapterMock = {
  features: new Set(['timestamp-query']),
  requestDevice: vi.fn((_descriptor) => Promise.resolve(mockDevice)),
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
  width: (descriptor.size as number[])[0] ?? 1,
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
  get mock() {
    return mockRenderPassEncoder;
  },
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
  createBindGroup: vi.fn((_descriptor: GPUBindGroupDescriptor) => 'mockBindGroup'),
  createBindGroupLayout: vi.fn(
    (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
  ),
  createBuffer: vi.fn(({ size, usage, mappedAtCreation, label }: GPUBufferDescriptor) => {
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
  }),
  createCommandEncoder: vi.fn(() => mockCommandEncoder),
  createComputePipeline: vi.fn(() => mockComputePipeline),
  createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
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
  device: GPUDevice & { mock: typeof mockDevice };
}>({
  _global: [
    async ({}, use) => {
      vi.stubGlobal('navigator', navigatorMock);

      await use(undefined);

      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    },
    { auto: true }, // Always runs
  ],

  device: async ({}, use) => {
    await use(mockDevice as unknown as GPUDevice & { mock: typeof mockDevice });
  },
});

export { tgpu };
