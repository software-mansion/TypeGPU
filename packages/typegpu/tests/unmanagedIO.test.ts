import { beforeEach, describe, expect, it, vi } from 'vitest';
import { arrayOf, u32 } from '../src/data';
import tgpu from '../src/index';
import './utils/webgpuGlobals';

const mockBuffer = {
  mapState: 'unmapped',
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
  destroy: vi.fn(),
};

const mockStagingBuffer = {
  mapState: 'unmapped',
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
  destroy: vi.fn(),
};

const mockCommandEncoder = {
  beginComputePass: vi.fn(() => mockComputePassEncoder),
  beginRenderPass: vi.fn(),
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

const mockDevice = {
  createBindGroup: vi.fn(() => 'mockBindGroup'),
  createBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
  createBuffer: vi.fn(),
  createCommandEncoder: vi.fn(() => mockCommandEncoder),
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
};

function setupMocks() {
  mockBuffer.mapState = 'unmapped';
  mockBuffer.usage = GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  mockStagingBuffer.mapState = 'unmapped';
  mockStagingBuffer.usage = GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST;
  mockDevice.createBuffer
    .mockReturnValueOnce(mockBuffer)
    .mockReturnValueOnce(mockStagingBuffer);
}

function setupMocksForWrapped() {
  mockDevice.createBuffer.mockReset();
  mockDevice.createBuffer.mockReturnValueOnce(mockStagingBuffer);
}

describe('unmanagedIO', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setupMocks();
  });

  it('should accept existing buffer', () => {
    const device = mockDevice as unknown as GPUDevice;
    const tgpuBuffer = tgpu
      .createBuffer(u32, mockBuffer as unknown as GPUBuffer)
      .$device(device);
    expect(tgpuBuffer.buffer).toBe(mockBuffer);
  });

  it('should create a buffer on demand', () => {
    const device = mockDevice as unknown as GPUDevice;
    const tgpuBuffer = tgpu.createBuffer(u32).$device(device);

    expect(device.createBuffer).not.toHaveBeenCalled();
    expect(tgpuBuffer.buffer).toBeDefined();

    expect(device.createBuffer).toHaveBeenCalledWith({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false,
    });
  });

  it('should create a buffer with initial data', () => {
    const device = mockDevice as unknown as GPUDevice;
    const tgpuBuffer = tgpu
      .createBuffer(arrayOf(u32, 3), [1, 2, 3])
      .$device(device);

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

  it('should write to a mapped buffer', () => {
    const device = mockDevice as unknown as GPUDevice;
    mockBuffer.mapState = 'mapped';
    const buffer = tgpu
      .createBuffer(arrayOf(u32, 3), mockBuffer as unknown as GPUBuffer)
      .$device(device);
    tgpu.write(buffer, [1, 2, 3]);

    expect(mockBuffer.getMappedRange).toHaveBeenCalled();
    expect(mockBuffer.unmap).not.toHaveBeenCalled();
  });

  it('should write to a buffer', () => {
    const device = mockDevice as unknown as GPUDevice;
    const buffer = tgpu.createBuffer(arrayOf(u32, 3)).$device(device);

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
    setupMocksForWrapped();
    const device = mockDevice as unknown as GPUDevice;
    mockBuffer.usage = GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST;
    const buffer = tgpu
      .createBuffer(arrayOf(u32, 3), mockBuffer as unknown as GPUBuffer)
      .$device(device);
    const data = await tgpu.read(buffer);

    expect(mockStagingBuffer.mapAsync).not.toHaveBeenCalled();
    expect(mockBuffer.mapAsync).toHaveBeenCalled();
    expect(data).toBeDefined();
  });

  it('should read from a mapped buffer', async () => {
    const device = mockDevice as unknown as GPUDevice;
    mockBuffer.mapState = 'mapped';
    const buffer = tgpu
      .createBuffer(arrayOf(u32, 3), mockBuffer as unknown as GPUBuffer)
      .$device(device);
    const data = await tgpu.read(buffer);

    expect(device.createBuffer).not.toHaveBeenCalled();
    expect(data).toBeDefined();
    expect(mockBuffer.getMappedRange).toHaveBeenCalled();
    expect(mockBuffer.unmap).not.toHaveBeenCalled();
  });

  it('should read from a mappable buffer', async () => {
    const device = mockDevice as unknown as GPUDevice;
    mockBuffer.usage = mockBuffer.usage | GPUBufferUsage.MAP_READ;
    const buffer = tgpu
      .createBuffer(arrayOf(u32, 3), mockBuffer as unknown as GPUBuffer)
      .$device(device);
    const data = await tgpu.read(buffer);

    expect(device.createBuffer).not.toHaveBeenCalled();
    expect(data).toBeDefined();
    expect(mockBuffer.getMappedRange).toHaveBeenCalled();
    expect(mockBuffer.unmap).toHaveBeenCalled();
  });

  it('should read from a buffer', async () => {
    const device = mockDevice as unknown as GPUDevice;
    const buffer = tgpu.createBuffer(arrayOf(u32, 3)).$device(device);

    const data = await tgpu.read(buffer);

    expect(device.createBuffer).toHaveBeenCalledWith({
      size: 12,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    expect(device.createBuffer).toHaveBeenCalledWith({
      size: 12,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
      mappedAtCreation: false,
    });

    expect(mockCommandEncoder.copyBufferToBuffer).toHaveBeenCalledWith(
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

  it('should destroy a buffer', () => {
    const device = mockDevice as unknown as GPUDevice;
    const buffer = tgpu.createBuffer(arrayOf(u32, 3)).$device(device);

    buffer.destroy();

    expect(() => buffer.buffer).toThrowError();
  });

  it('should destroy underlying buffer', () => {
    const device = mockDevice as unknown as GPUDevice;

    const buffer = tgpu
      .createBuffer(arrayOf(u32, 3), mockBuffer as unknown as GPUBuffer)
      .$device(device);
    buffer.destroy();

    expect(mockBuffer.destroy).toHaveBeenCalled();

    expect(() => buffer.buffer).toThrowError();
  });
});
