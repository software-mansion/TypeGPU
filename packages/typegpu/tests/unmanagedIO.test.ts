import { describe, expect, it, vi } from 'vitest';
import { u32 } from '../src/data';
import tgpu from '../src/index';

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

describe('unmanagedIO', () => {
  it('should accept exisisting buffer', () => {
    const device = mockDevice() as unknown as GPUDevice;
    const buffer = mockBuffer() as unknown as GPUBuffer;
    const tgpuBuffer = tgpu.buffer(u32, buffer).$device(device);
    expect(tgpuBuffer.buffer).toBe(buffer);
  });

  it('should create a buffer on demand', () => {
    const device = mockDevice() as unknown as GPUDevice;
    const tgpuBuffer = tgpu.buffer(u32, 12).$device(device);
    expect(device.createBuffer).not.toHaveBeenCalled();
    expect(tgpuBuffer.buffer).toBeDefined();
    expect(device.createBuffer).toHaveBeenCalledTimes(1);
    expect(device.createBuffer).toHaveBeenCalledWith({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  });
});
