import { wgsl } from 'typegpu';
import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { createRuntime, exportedForTesting } from '../src/createRuntime';
import { u32, vec3i } from '../src/data';
const { TypeGpuRuntimeImpl } = exportedForTesting;

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

global.GPUShaderStage = {
  VERTEX: 1,
  FRAGMENT: 2,
  COMPUTE: 4,
};

const mockBuffer = vi.fn(() => ({
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
}));

const mockCommandEncoder = vi.fn(() => ({
  beginComputePass: vi.fn(() => mockComputePassEncoder()),
  beginRenderPass: vi.fn(),
  clearBuffer: vi.fn(),
  copyBufferToBuffer: vi.fn(),
  copyBufferToTexture: vi.fn(),
  copyTextureToBuffer: vi.fn(),
  copyTextureToTexture: vi.fn(),
  finish: vi.fn(),
}));

const mockComputePassEncoder = vi.fn(() => ({
  dispatchWorkgroups: vi.fn(),
  end: vi.fn(),
  setBindGroup: vi.fn(),
  setPipeline: vi.fn(),
}));

const mockDevice = vi.fn(() => ({
  createBindGroup: vi.fn(() => 'mockBindGroup'),
  createBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
  createBuffer: vi.fn(() => mockBuffer()),
  createCommandEncoder: vi.fn(() => mockCommandEncoder()),
  createComputePipeline: vi.fn(() => 'mockComputePipeline'),
  createPipelineLayout: vi.fn(() => 'mockPipelineLayout'),
  createRenderPipeline: vi.fn(() => 'mockRenderPipeline'),
  createSampler: vi.fn(() => 'mockSampler'),
  createShaderModule: vi.fn(() => 'mockShaderModule'),
  createTexture: vi.fn(() => 'mockTexture'),
  importExternalTexture: vi.fn(() => 'mockExternalTexture'),
  queue: {
    copyExternalImageToTexture: vi.fn(),
    onSubmittedWorkDone: vi.fn(),
    submit: vi.fn(),
    writeBuffer: vi.fn(),
    writeTexture: vi.fn(),
  },
}));

vi.stubGlobal('GPUDevice', mockDevice);

vi.mock('../src/createRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/createRuntime')>();
  return {
    ...actual,
    // @ts-ignore
    createRuntime: vi.fn(() => new TypeGpuRuntimeImpl(mockDevice())),
  };
});

describe('TypeGpuRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create buffer with no initialization', async () => {
    const runtime = await createRuntime();
    const bufferData = wgsl.buffer(u32).$allowUniform();
    const buffer = bufferData.asUniform();

    const testPipeline = runtime.makeComputePipeline({
      code: wgsl`${buffer}`,
    });

    expect(testPipeline).toBeDefined();
    expect(runtime.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 4,
      usage: 76,
    });
  });

  it('should create buffer with initialization', async () => {
    const runtime = await createRuntime();
    const bufferData = wgsl.buffer(vec3i, [0, 0, 0]).$allowUniform();
    const buffer = bufferData.asUniform();

    const testPipeline = runtime.makeComputePipeline({
      code: wgsl`${buffer}`,
    });

    expect(testPipeline).toBeDefined();
    expect(runtime.device.createBuffer).toBeCalledWith({
      mappedAtCreation: true,
      size: 16,
      usage: 76,
    });
  });
});
