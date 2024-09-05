import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { createRuntime } from '../src/createRuntime';
import { struct, u32, vec3i, vec4u } from '../src/data';
import { asReadonly, asUniform, wgsl } from '../src/experimental';
import { plum } from '../src/wgslPlum';

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

describe('TgpuRuntime', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create buffer with no initialization', async () => {
    const runtime = await createRuntime(mockDevice() as unknown as GPUDevice);
    const bufferData = wgsl.buffer(u32).$allowUniform();
    const buffer = asUniform(bufferData);

    const testPipeline = runtime.makeComputePipeline({
      code: wgsl`${buffer}`,
    });

    const mockBuffer = runtime.bufferFor(bufferData);
    expect(mockBuffer).toBeDefined();
    expect(mockBuffer.getMappedRange).not.toBeCalled();

    expect(testPipeline).toBeDefined();
    expect(runtime.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 4,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });
  });

  it('should create buffer with initialization', async () => {
    const runtime = await createRuntime(mockDevice() as unknown as GPUDevice);
    const bufferData = wgsl.buffer(vec3i, vec3i(0, 0, 0)).$allowUniform();
    const buffer = asUniform(bufferData);

    const testPipeline = runtime.makeComputePipeline({
      code: wgsl`${buffer}`,
    });

    const mockBuffer = runtime.bufferFor(bufferData);
    expect(mockBuffer).toBeDefined();
    expect(mockBuffer.getMappedRange).toBeCalled();

    expect(testPipeline).toBeDefined();
    expect(runtime.device.createBuffer).toBeCalledWith({
      mappedAtCreation: true,
      size: 16,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });
  });

  it('should allocate buffer with proper size for nested structs', async () => {
    const runtime = await createRuntime(mockDevice() as unknown as GPUDevice);
    const s1 = struct({ a: u32, b: u32 });
    const s2 = struct({ a: u32, b: s1 });
    const bufferData = wgsl.buffer(s2).$allowUniform();
    const buffer = asUniform(bufferData);

    const testPipeline = runtime.makeComputePipeline({
      code: wgsl`${buffer}`,
    });

    testPipeline.execute();

    expect(testPipeline).toBeDefined();
    expect(runtime.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 12,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });
  });

  it('should properly write to buffer', async () => {
    const runtime = await createRuntime(mockDevice() as unknown as GPUDevice);
    const bufferData = wgsl.buffer(u32);

    runtime.writeBuffer(bufferData, 3);

    const mockBuffer = runtime.bufferFor(bufferData);
    expect(mockBuffer).toBeDefined();

    expect(runtime.device.queue.writeBuffer).toBeCalledWith(
      mockBuffer,
      0,
      new ArrayBuffer(4),
      0,
      4,
    );
  });

  it('should properly write to complex buffer', async () => {
    const runtime = await createRuntime(mockDevice() as unknown as GPUDevice);

    const s1 = struct({ a: u32, b: u32, c: vec3i });
    const s2 = struct({ a: u32, b: s1, c: vec4u });

    const bufferData = wgsl.buffer(s2).$allowUniform();
    const buffer = asUniform(bufferData);

    const testPipeline = runtime.makeComputePipeline({
      code: wgsl`let x = ${buffer};`,
    });

    testPipeline.execute();

    expect(testPipeline).toBeDefined();
    expect(runtime.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 64,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });

    runtime.writeBuffer(bufferData, {
      a: 3,
      b: { a: 4, b: 5, c: vec3i(6, 7, 8) },
      c: vec4u(9, 10, 11, 12),
    });

    const mockBuffer = runtime.bufferFor(bufferData);
    expect(mockBuffer).toBeDefined();

    expect(runtime.device.queue.writeBuffer).toBeCalledWith(
      mockBuffer,
      0,
      new ArrayBuffer(64),
      0,
      64,
    );
  });

  it('should properly write to buffer with plum initialization', async () => {
    const runtime = await createRuntime(mockDevice() as unknown as GPUDevice);
    const spy = vi.spyOn(runtime, 'writeBuffer');
    const intPlum = plum<number>(3);

    const bufferData = wgsl.buffer(u32, intPlum).$allowReadonly();
    const buffer = asReadonly(bufferData);

    const testPipeline = runtime.makeComputePipeline({
      code: wgsl`${buffer}`,
    });

    testPipeline.execute();

    expect(spy).toBeCalledTimes(0);
    expect(testPipeline).toBeDefined();
    expect(runtime.device.createBuffer).toBeCalledWith({
      mappedAtCreation: true,
      size: 4,
      usage:
        global.GPUBufferUsage.STORAGE |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });

    runtime.setPlum(intPlum, 5);

    expect(spy).toBeCalledTimes(1);
    const mockBuffer = runtime.bufferFor(bufferData);
    expect(runtime.device.queue.writeBuffer).toBeCalledWith(
      mockBuffer,
      0,
      new ArrayBuffer(4),
      0,
      4,
    );
  });
});
