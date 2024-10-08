import { describe, expect, it, vi } from 'vitest';
import { afterEach } from 'vitest';
import { struct, u32, vec3i, vec4u } from '../src/data';
import tgpu, { asReadonly, asUniform, wgsl } from '../src/experimental';
import { plum } from '../src/tgpuPlum';
import './utils/webgpuGlobals';

const mockBuffer = {
  getMappedRange: vi.fn(() => new ArrayBuffer(8)),
  unmap: vi.fn(),
  mapAsync: vi.fn(),
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
  createBindGroup: vi.fn(() => 'mockBindGroup'),
  createBindGroupLayout: vi.fn(() => 'mockBindGroupLayout'),
  createBuffer: vi.fn(() => mockBuffer),
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

describe('TgpuRoot', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create buffer with no initialization', async () => {
    const root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
    const dataBuffer = root.createBuffer(u32).$usage(tgpu.Uniform);
    const data = asUniform(dataBuffer);

    const testPipeline = root.makeComputePipeline({
      code: wgsl`${data}`,
    });

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();
    expect(mockBuffer.getMappedRange).not.toBeCalled();

    expect(testPipeline).toBeDefined();
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 4,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });
  });

  it('should create buffer with initialization', async () => {
    const root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
    const dataBuffer = root
      .createBuffer(vec3i, vec3i(0, 0, 0))
      .$usage(tgpu.Uniform);
    const data = asUniform(dataBuffer);

    const testPipeline = root.makeComputePipeline({
      code: wgsl`${data}`,
    });

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();
    expect(mockBuffer.getMappedRange).toBeCalled();

    expect(testPipeline).toBeDefined();
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: true,
      size: 12,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });
  });

  it('should allocate buffer with proper size for nested structs', async () => {
    const root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
    const s1 = struct({ a: u32, b: u32 });
    const s2 = struct({ a: u32, b: s1 });
    const dataBuffer = root.createBuffer(s2).$usage(tgpu.Uniform);
    const data = asUniform(dataBuffer);

    const testPipeline = root.makeComputePipeline({
      code: wgsl`${data}`,
    });

    testPipeline.execute();

    expect(testPipeline).toBeDefined();
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 12,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });
  });

  it('should properly write to buffer', async () => {
    const root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
    const dataBuffer = root.createBuffer(u32);

    dataBuffer.write(3);

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();

    expect(root.device.queue.writeBuffer).toBeCalledWith(
      mockBuffer,
      0,
      new ArrayBuffer(4),
      0,
      4,
    );
  });

  it('should properly write to complex buffer', async () => {
    const root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });

    const s1 = struct({ a: u32, b: u32, c: vec3i });
    const s2 = struct({ a: u32, b: s1, c: vec4u });

    const dataBuffer = root.createBuffer(s2).$usage(tgpu.Uniform);
    const data = asUniform(dataBuffer);

    const testPipeline = root.makeComputePipeline({
      code: wgsl`let x = ${data};`,
    });

    testPipeline.execute();

    expect(testPipeline).toBeDefined();
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 64,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });

    dataBuffer.write({
      a: 3,
      b: { a: 4, b: 5, c: vec3i(6, 7, 8) },
      c: vec4u(9, 10, 11, 12),
    });

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();

    expect(root.device.queue.writeBuffer).toBeCalledWith(
      mockBuffer,
      0,
      new ArrayBuffer(64),
      0,
      64,
    );
  });

  it('should properly write to buffer with plum initialization', async () => {
    const root = await tgpu.init({
      device: mockDevice as unknown as GPUDevice,
    });
    const intPlum = plum<number>(3);

    const dataBuffer = root.createBuffer(u32, intPlum).$usage(tgpu.Storage);
    const spy = vi.spyOn(dataBuffer, 'write');

    const buffer = asReadonly(dataBuffer);

    const testPipeline = root.makeComputePipeline({
      code: wgsl`${buffer}`,
    });

    testPipeline.execute();

    expect(spy).toBeCalledTimes(0);
    expect(testPipeline).toBeDefined();
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: true,
      size: 4,
      usage:
        global.GPUBufferUsage.STORAGE |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
    });

    root.setPlum(intPlum, 5);

    expect(spy).toBeCalledTimes(1);
    const mockBuffer = root.unwrap(dataBuffer);
    expect(root.device.queue.writeBuffer).toBeCalledWith(
      mockBuffer,
      0,
      new ArrayBuffer(4),
      0,
      4,
    );
  });

  // it('creates a pipeline descriptor with a valid vertex buffer', async () => {
  //   const root = await tgpu.init({
  //     device: mockDevice as unknown as GPUDevice,
  //   });

  //   const dataBuffer = root.createBuffer(vec3f).$usage(tgpu.Vertex);
  //   const data = asVertex(dataBuffer, 'vertex');

  //   const testPipeline = root.makeRenderPipeline({
  //     vertex: {
  //       code: wgsl`${data}`,
  //       output: {},
  //     },
  //     fragment: { code: wgsl``, target: [] },
  //     primitive: {
  //       topology: 'triangle-list',
  //     },
  //   });

  //   testPipeline.execute({
  //     colorAttachments: [],
  //     vertexCount: 3,
  //   });

  //   expect(testPipeline).toBeDefined();
  //   expect(root.device.createBuffer).toBeCalledWith({
  //     mappedAtCreation: false,
  //     size: 12,
  //     usage:
  //       global.GPUBufferUsage.VERTEX |
  //       global.GPUBufferUsage.COPY_DST |
  //       global.GPUBufferUsage.COPY_SRC,
  //   });
  //   expect(mockRenderPassEncoder.setVertexBuffer).toBeCalledWith(0, mockBuffer);
  //   expect(mockDevice.createRenderPipeline).toBeCalledWith({
  //     fragment: {
  //       module: 'mockShaderModule',
  //       targets: [],
  //     },
  //     label: '',
  //     layout: 'mockPipelineLayout',
  //     primitive: {
  //       topology: 'triangle-list',
  //     },
  //     vertex: {
  //       buffers: [
  //         {
  //           arrayStride: 12,
  //           attributes: [
  //             {
  //               format: 'float32x3',
  //               offset: 0,
  //               shaderLocation: 0,
  //             },
  //           ],
  //           stepMode: 'vertex',
  //         },
  //       ],
  //       module: 'mockShaderModule',
  //     },
  //   });
  // });

  // it('creates a pipeline descriptor with a valid vertex buffer (array)', async () => {
  //   const root = await tgpu.init({
  //     device: mockDevice as unknown as GPUDevice,
  //   });

  //   const dataBuffer = root
  //     .createBuffer(arrayOf(vec2f, 10))
  //     .$usage(tgpu.Vertex);
  //   const data = asVertex(dataBuffer, 'vertex');

  //   const testPipeline = root.makeRenderPipeline({
  //     vertex: {
  //       code: wgsl`${data}`,
  //       output: {},
  //     },
  //     fragment: { code: wgsl``, target: [] },
  //     primitive: {
  //       topology: 'triangle-list',
  //     },
  //   });

  //   testPipeline.execute({
  //     colorAttachments: [],
  //     vertexCount: 3,
  //   });

  //   expect(testPipeline).toBeDefined();
  //   expect(root.device.createBuffer).toBeCalledWith({
  //     mappedAtCreation: false,
  //     size: 80,
  //     usage:
  //       global.GPUBufferUsage.VERTEX |
  //       global.GPUBufferUsage.COPY_DST |
  //       global.GPUBufferUsage.COPY_SRC,
  //   });

  //   expect(mockRenderPassEncoder.setVertexBuffer).toBeCalledWith(0, mockBuffer);

  //   expect(mockDevice.createRenderPipeline).toBeCalledWith({
  //     fragment: {
  //       module: 'mockShaderModule',
  //       targets: [],
  //     },
  //     label: '',
  //     layout: 'mockPipelineLayout',
  //     primitive: {
  //       topology: 'triangle-list',
  //     },
  //     vertex: {
  //       buffers: [
  //         {
  //           arrayStride: 8,
  //           attributes: [
  //             {
  //               format: 'float32x2',
  //               offset: 0,
  //               shaderLocation: 0,
  //             },
  //           ],
  //           stepMode: 'vertex',
  //         },
  //       ],
  //       module: 'mockShaderModule',
  //     },
  //   });
  // });

  // it('should throw an error when trying to create an invalid vertex buffer', async () => {
  //   const root = await tgpu.init({
  //     device: mockDevice as unknown as GPUDevice,
  //   });

  //   const bufferData = root
  //     .createBuffer(
  //       struct({
  //         i: vec2f,
  //         should: vec3f,
  //         throw: u32,
  //       }),
  //     )
  //     .$usage(tgpu.Vertex);

  //   expect(() => asVertex(bufferData, 'vertex')).toThrowError(
  //     'Cannot create vertex buffer with complex data types.',
  //   );
  // });

  // it('should properly extract primitive type from nested arrays in vertex buffer', async () => {
  //   const root = await tgpu.init({
  //     device: mockDevice as unknown as GPUDevice,
  //   });

  //   const bufferData = root
  //     .createBuffer(arrayOf(arrayOf(arrayOf(u32, 10), 3), 2))
  //     .$usage(tgpu.Vertex);

  //   const buffer = asVertex(bufferData, 'vertex');

  //   expect(buffer.vertexLayout).toEqual({
  //     arrayStride: 4,
  //     stepMode: 'vertex',
  //   });
  // });
});
