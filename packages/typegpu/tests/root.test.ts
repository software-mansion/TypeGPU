import { describe, expect } from 'vitest';
import { struct, u32, vec3i, vec4u } from '../src/data';
import './utils/webgpuGlobals';
import { it } from './utils/extendedIt';

describe('TgpuRoot', () => {
  it('should create buffer with no initialization', ({ root }) => {
    const dataBuffer = root.createBuffer(u32).$usage('uniform');

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();
    expect(mockBuffer.getMappedRange).not.toBeCalled();

    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 4,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
      label: '<unnamed>',
    });
  });

  it('should create buffer with initialization', ({ root }) => {
    const dataBuffer = root
      .createBuffer(vec3i, vec3i(0, 0, 0))
      .$usage('uniform');

    const mockBuffer = root.unwrap(dataBuffer);
    expect(mockBuffer).toBeDefined();
    expect(mockBuffer.getMappedRange).toBeCalled();

    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: true,
      size: 12,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
      label: '<unnamed>',
    });
  });

  it('should allocate buffer with proper size for nested structs', ({
    root,
  }) => {
    const s1 = struct({ a: u32, b: u32 });
    const s2 = struct({ a: u32, b: s1 });
    const dataBuffer = root.createBuffer(s2).$usage('uniform');

    root.unwrap(dataBuffer);
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 12,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
      label: '<unnamed>',
    });
  });

  it('should properly write to buffer', ({ root }) => {
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

  it('should properly write to complex buffer', ({ root }) => {
    const s1 = struct({ a: u32, b: u32, c: vec3i });
    const s2 = struct({ a: u32, b: s1, c: vec4u });

    const dataBuffer = root.createBuffer(s2).$usage('uniform');

    root.unwrap(dataBuffer);
    expect(root.device.createBuffer).toBeCalledWith({
      mappedAtCreation: false,
      size: 64,
      usage:
        global.GPUBufferUsage.UNIFORM |
        global.GPUBufferUsage.COPY_DST |
        global.GPUBufferUsage.COPY_SRC,
      label: '<unnamed>',
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

  // TODO: Adapt the tests to the new API
  // it('creates a pipeline descriptor with a valid vertex buffer', () => {
  //   const root = tgpu.initFromDevice({
  //     device: mockDevice as unknown as GPUDevice,
  //   });

  //   const dataBuffer = root.createBuffer(vec3f).$usage('vertex');
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

  // it('creates a pipeline descriptor with a valid vertex buffer (array)', () => {
  //   const root = tgpu.initFromDevice({
  //     device: mockDevice as unknown as GPUDevice,
  //   });

  //   const dataBuffer = root
  //     .createBuffer(arrayOf(vec2f, 10))
  //     .$usage('vertex');
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

  // it('should throw an error when trying to create an invalid vertex buffer', () => {
  //   const root = tgpu.initFromDevice({
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
  //     .$usage('vertex');

  //   expect(() => asVertex(bufferData, 'vertex')).toThrowError(
  //     'Cannot create vertex buffer with complex data types.',
  //   );
  // });

  // it('should properly extract primitive type from nested arrays in vertex buffer', () => {
  //   const root = tgpu.initFromDevice({
  //     device: mockDevice as unknown as GPUDevice,
  //   });

  //   const bufferData = root
  //     .createBuffer(arrayOf(arrayOf(arrayOf(u32, 10), 3), 2))
  //     .$usage('vertex');

  //   const buffer = asVertex(bufferData, 'vertex');

  //   expect(buffer.vertexLayout).toEqual({
  //     arrayStride: 4,
  //     stepMode: 'vertex',
  //   });
  // });
});
