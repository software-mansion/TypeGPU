import { typedDevice } from 'typegpu';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { arrayOf, u32 } from '../src/data';

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

const mockBuffer = vi.fn(() => ({
  mapState: 'unmapped',
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
  typeInfo: {
    write: vi.fn(),
    read: vi.fn(),
  },
}));

const mockDevice = vi.fn(() => ({
  createBindGroup: vi.fn(() => 'mockBindGroup'),
  createBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
  createBuffer: vi.fn(() => mockBuffer()),
  createCommandEncoder: vi.fn(() => 'mockCommandEncoder'),
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

interface GPUDeviceTypedTests extends GPUDeviceTyped {
  typedQueue: GPUQueueTyped;
}

describe('typedDevice', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create buffer with no initialization', () => {
    const mock = mockDevice();
    const device = typedDevice(mock as unknown as GPUDevice);

    device.createBuffer({
      size: 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    expect(mock.createBuffer).toHaveBeenCalledWith({
      size: 8,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
  });

  it('should create typed buffer with no initialization', () => {
    const mock = mockDevice();
    const device = typedDevice(mock as unknown as GPUDevice);

    device.createBuffer({
      type: arrayOf(u32, 4),
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    expect(mock.createBuffer).toHaveBeenCalledWith({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
      mappedAtCreation: false,
    });
  });

  it('should create mapped typed buffer with initialization', () => {
    const mock = mockDevice();
    const device = typedDevice(
      mock as unknown as GPUDevice,
    ) as GPUDeviceTypedTests;

    Object.defineProperty(device, 'typedQueue', {
      value: {
        writeBuffer: vi.fn(),
      },
    });

    mock.createBuffer.mockImplementationOnce(
      vi.fn(() => ({
        mapState: 'mapped',
        getMappedRange: vi.fn(() => new ArrayBuffer(16)),
        unmap: vi.fn(),
        mapAsync: vi.fn(),
        typeInfo: {
          write: vi.fn(),
          read: vi.fn(),
        },
      })),
    );

    const buffer = device.createBuffer(
      {
        type: arrayOf(u32, 4),
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
        mappedAtCreation: true,
      },
      [1, 2, 3, 4],
    );

    expect(mock.createBuffer).toHaveBeenCalledTimes(1);
    expect(mock.createBuffer).toHaveBeenCalledWith({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
      mappedAtCreation: true,
    });
    expect(device.typedQueue.writeBuffer).toHaveBeenCalledWith(
      buffer,
      [1, 2, 3, 4],
    );
  });

  it('should create typed buffer with initialization', () => {
    const mock = mockDevice();
    const device = typedDevice(
      mock as unknown as GPUDevice,
    ) as GPUDeviceTypedTests;

    Object.defineProperty(device, 'typedQueue', {
      value: {
        writeBuffer: vi.fn(),
      },
    });

    mock.createBuffer.mockImplementationOnce(
      vi.fn(() => ({
        mapState: 'unmapped',
        getMappedRange: vi.fn(() => new ArrayBuffer(16)),
        unmap: vi.fn(),
        mapAsync: vi.fn(),
        typeInfo: {
          write: vi.fn(),
          read: vi.fn(),
        },
      })),
    );

    const buffer = device.createBuffer(
      {
        type: arrayOf(u32, 4),
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
      },
      [1, 2, 3, 4],
    );

    expect(mock.createBuffer).toHaveBeenCalledTimes(1);
    expect(mock.createBuffer).toHaveBeenCalledWith({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
      mappedAtCreation: false,
    });
    expect(device.typedQueue.writeBuffer).toHaveBeenCalledWith(
      buffer,
      [1, 2, 3, 4],
    );
  });
});
