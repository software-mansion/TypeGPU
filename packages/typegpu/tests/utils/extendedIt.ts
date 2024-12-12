import { it as base, vi } from 'vitest';
import { type ExperimentalTgpuRoot, tgpu } from '../../src/experimental';
import './webgpuGlobals';

const adapterMock = {
  requestDevice: vi.fn((descriptor) => Promise.resolve(mockDevice)),
};

const navigatorMock = {
  gpu: {
    __brand: 'GPU',
    requestAdapter: vi.fn(() => Promise.resolve(adapterMock)),
  },
};

const mappedBufferMock = {
  get mock() {
    return mappedBufferMock;
  },
  mapState: 'mapped',
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
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
  get mock() {
    return mockDevice;
  },
  createBindGroup: vi.fn(
    (_descriptor: GPUBindGroupDescriptor) => 'mockBindGroup',
  ),
  createBindGroupLayout: vi.fn(
    (_descriptor: GPUBindGroupLayoutDescriptor) => 'mockBindGroupLayout',
  ),
  createBuffer: vi.fn(({ size, usage }: GPUBufferDescriptor) => {
    const mockBuffer = {
      mapState: 'unmapped',
      usage,
      getMappedRange: vi.fn(() => new ArrayBuffer(8)),
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
  destroy: vi.fn(),
};

export const it = base.extend<{
  _global: undefined;
  commandEncoder: GPUCommandEncoder & { mock: typeof mockCommandEncoder };
  mappedBuffer: GPUBuffer & { mock: typeof mappedBufferMock };
  device: GPUDevice & { mock: typeof mockDevice };
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

  mappedBuffer: async ({ task }, use) => {
    await use(
      mappedBufferMock as unknown as GPUBuffer & {
        mock: typeof mappedBufferMock;
      },
    );
  },

  device: async ({ task }, use) => {
    await use(mockDevice as unknown as GPUDevice & { mock: typeof mockDevice });
  },

  root: async ({ task }, use) => {
    const root = await tgpu.init();

    await use(root);

    root.destroy();
  },
});
