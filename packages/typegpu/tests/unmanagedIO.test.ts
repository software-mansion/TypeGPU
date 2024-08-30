import { describe, expect, it, vi } from 'vitest';
import { arrayOf, u32 } from '../src/data';
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

global.GPUMapMode = {
  READ: 0,
  WRITE: 1,
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
  destroy: vi.fn(),
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
    const tgpuBuffer = tgpu.buffer(u32).$device(device);

    expect(device.createBuffer).not.toHaveBeenCalled();
    expect(tgpuBuffer.buffer).toBeDefined();

    expect(device.createBuffer).toHaveBeenCalledWith({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false,
    });
  });

  it('should create a buffer with initial data', () => {
    const device = mockDevice() as unknown as GPUDevice;
    const tgpuBuffer = tgpu.buffer(arrayOf(u32, 3), [1, 2, 3]).$device(device);

    expect(device.createBuffer).not.toHaveBeenCalled();
    expect(tgpuBuffer.buffer).toBeDefined();

    expect(device.createBuffer).toHaveBeenCalledWith({
      size: 12,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    expect(tgpuBuffer.buffer.getMappedRange).toHaveBeenCalled();
    expect(tgpuBuffer.buffer.unmap).toHaveBeenCalled();
  });

  it('should map a mappable buffer on mapWrite', () => {
    const device = mockDevice() as unknown as GPUDevice;
    const mockBuffer = {
      getMappedRange: vi.fn(() => new Uint32Array([0, 0, 0])),
      unmap: vi.fn(),
      mapAsync: vi.fn(),
      usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    } as unknown as GPUBuffer;
    const buffer = tgpu.buffer(arrayOf(u32, 3), mockBuffer).$device(device);
    tgpu.mapWrite(buffer, [1, 2, 3]);

    expect(mockBuffer.mapAsync).toHaveBeenCalled();
  });

  it('should write to a mapped buffer', () => {
    const device = mockDevice() as unknown as GPUDevice;
    const mockBuffer = {
      mapState: 'mapped',
      getMappedRange: vi.fn(() => new Uint32Array([0, 0, 0])),
      unmap: vi.fn(),
      mapAsync: vi.fn(),
      usage: GPUBufferUsage.MAP_WRITE | GPUBufferUsage.COPY_SRC,
    } as unknown as GPUBuffer;
    const buffer = tgpu.buffer(arrayOf(u32, 3), mockBuffer).$device(device);
    tgpu.write(buffer, [1, 2, 3]);

    expect(mockBuffer.getMappedRange).toHaveBeenCalled();
    expect(mockBuffer.unmap).toHaveBeenCalled();
  });

  it('should write to a buffer', () => {
    const device = mockDevice() as unknown as GPUDevice;

    const buffer = tgpu.buffer(arrayOf(u32, 3)).$device(device);

    tgpu.write(buffer, [1, 2, 3]);

    expect(device.queue.writeBuffer).toHaveBeenCalledWith(
      buffer.buffer,
      0,
      new ArrayBuffer(0),
      0,
      12,
    );
  });

  it('should map a mappable buffer before reading', async () => {
    const device = mockDevice() as unknown as GPUDevice;
    const mockBuffer = {
      mapState: 'unmapped',
      getMappedRange: vi.fn(() => new Uint32Array([1, 2, 3])),
      unmap: vi.fn(),
      mapAsync: vi.fn(),
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    } as unknown as GPUBuffer;
    const buffer = tgpu.buffer(arrayOf(u32, 3), mockBuffer).$device(device);
    const data = await tgpu.read(buffer);

    expect(mockBuffer.mapAsync).toHaveBeenCalled();
  });

  it('should read from a mapped buffer', async () => {
    const device = mockDevice() as unknown as GPUDevice;
    const mockBuffer = {
      mapState: 'mapped',
      dataType: {
        read: vi.fn(() => [1, 2, 3]),
      },
      getMappedRange: vi.fn(() => new Uint32Array([1, 2, 3])),
      unmap: vi.fn(),
      mapAsync: vi.fn(),
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    } as unknown as GPUBuffer;
    const buffer = tgpu.buffer(arrayOf(u32, 3), mockBuffer).$device(device);
    const data = await tgpu.read(buffer);

    expect(device.createBuffer).not.toHaveBeenCalled();
    expect(data).toBeDefined();
    expect(mockBuffer.getMappedRange).toHaveBeenCalled();
    expect(mockBuffer.unmap).toHaveBeenCalled();
  });

  it('should read from a buffer', async () => {
    const device = mockDevice() as unknown as GPUDevice;
    const mockEncoder = device.createCommandEncoder();
    device.createCommandEncoder = vi.fn(() => mockEncoder);
    const mockStagingBuffer = {
      mapAsync: vi.fn(),
      getMappedRange: vi.fn(() => new Uint32Array([1, 2, 3])),
      unmap: vi.fn(),
      destroy: vi.fn(),
    } as unknown as GPUBuffer;
    device.createBuffer = vi.fn(() => mockStagingBuffer);
    const buffer = tgpu.buffer(arrayOf(u32, 3)).$device(device);

    const data = await tgpu.read(buffer);

    expect(device.createBuffer).toHaveBeenCalledWith({
      size: 12,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    expect(mockEncoder.copyBufferToBuffer).toHaveBeenCalledWith(
      buffer.buffer,
      0,
      mockStagingBuffer,
      0,
      12,
    );
    expect(device.queue.submit).toHaveBeenCalled();
    expect(mockStagingBuffer.mapAsync).toHaveBeenCalled();
    expect(mockStagingBuffer.getMappedRange).toHaveBeenCalled();
    expect(mockStagingBuffer.unmap).toHaveBeenCalled();
    expect(mockStagingBuffer.destroy).toHaveBeenCalled();

    expect(data).toBeDefined();
  });
});
