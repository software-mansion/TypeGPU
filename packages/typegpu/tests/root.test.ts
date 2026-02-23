import { describe, expect, vi } from 'vitest';
import { Void } from '../src/data/wgslTypes.ts';
import tgpu, { d } from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

describe('TgpuRoot', () => {
  describe('.createBuffer', () => {
    it('should create buffer with no initialization', ({ root }) => {
      const dataBuffer = root.createBuffer(d.u32).$usage('uniform');

      const mockBuffer = root.unwrap(dataBuffer);
      expect(mockBuffer).toBeDefined();
      expect(mockBuffer.getMappedRange).not.toBeCalled();

      expect(root.device.createBuffer).toBeCalledWith({
        label: 'dataBuffer',
        mappedAtCreation: false,
        size: 4,
        usage: GPUBufferUsage.UNIFORM |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    });

    it('should create buffer with initialization', ({ root }) => {
      const dataBuffer = root
        .createBuffer(d.vec3i, d.vec3i(0, 0, 0))
        .$usage('uniform');

      const mockBuffer = root.unwrap(dataBuffer);
      expect(mockBuffer).toBeDefined();
      expect(mockBuffer.getMappedRange).toBeCalled();

      expect(root.device.createBuffer).toBeCalledWith({
        label: 'dataBuffer',
        mappedAtCreation: true,
        size: 12,
        usage: GPUBufferUsage.UNIFORM |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    });

    it('should allocate buffer with proper size for nested structs', ({ root }) => {
      const s1 = d.struct({ a: d.u32, b: d.u32 });
      const s2 = d.struct({ a: d.u32, b: s1 });
      const dataBuffer = root.createBuffer(s2).$usage('uniform');

      root.unwrap(dataBuffer);
      expect(root.device.createBuffer).toBeCalledWith({
        label: 'dataBuffer',
        mappedAtCreation: false,
        size: 12,
        usage: GPUBufferUsage.UNIFORM |
          GPUBufferUsage.COPY_DST |
          GPUBufferUsage.COPY_SRC,
      });
    });
  });

  describe('.destroy', () => {
    it('should call .destroy on the device it created', ({ root }) => {
      const buffer1 = root.createBuffer(d.f32);
      const buffer2 = root.createBuffer(d.i32);
      const buffer3 = root.createBuffer(d.u32);

      const buffer1DestroySpy = vi.spyOn(buffer1, 'destroy');
      const buffer2DestroySpy = vi.spyOn(buffer2, 'destroy');
      const buffer3DestroySpy = vi.spyOn(buffer3, 'destroy');

      root.destroy();

      expect(root.device.destroy).toHaveBeenCalledOnce();
      expect(buffer1DestroySpy).not.toHaveBeenCalled();
      expect(buffer2DestroySpy).not.toHaveBeenCalled();
      expect(buffer3DestroySpy).not.toHaveBeenCalled();
    });
  });

  describe('.unwrap', () => {
    it('should throw error when unwrapping destroyed buffer', ({ root }) => {
      const buffer = root.createBuffer(d.f32);

      buffer.destroy();

      expect(() => root.unwrap(buffer)).toThrowError();
    });

    it('should return the same buffer that was passed into .createBuffer', ({ root }) => {
      const rawBuffer = root.device.createBuffer({
        size: 4,
        usage: GPUBufferUsage.UNIFORM,
      });

      const buffer = root.createBuffer(d.u32, rawBuffer);
      expect(root.unwrap(buffer)).toBe(rawBuffer);
    });

    it('should return the correct GPUVertexBufferLayout for a simple vertex layout', ({ root }) => {
      const vertexLayout = tgpu.vertexLayout(
        d.arrayOf(d.location(0, d.vec2u)),
        'vertex',
      );

      expect(root.unwrap(vertexLayout)).toStrictEqual({
        arrayStride: 8,
        stepMode: 'vertex',
        attributes: [
          {
            format: 'uint32x2',
            offset: 0,
            shaderLocation: 0,
          },
        ],
      });
    });

    it('should return the correct GPUVertexBufferLayout for a complex vertex layout', ({ root }) => {
      const VertexData = d.unstruct({
        position: d.location(0, d.float32x3),
        color: d.location(1, d.unorm10_10_10_2),
        something: d.location(2, d.u32),
      });

      const vertexLayout = tgpu.vertexLayout(
        d.disarrayOf(VertexData),
        'instance',
      );

      expect(root.unwrap(vertexLayout)).toStrictEqual({
        arrayStride: 20,
        stepMode: 'instance',
        attributes: [
          {
            format: 'float32x3',
            offset: 0,
            shaderLocation: 0,
          },
          {
            format: 'unorm10-10-10-2',
            offset: 12,
            shaderLocation: 1,
          },
          {
            format: 'uint32',
            offset: 16,
            shaderLocation: 2,
          },
        ],
      });
    });
  });

  describe('.$usage', () => {
    it('should only allow vertex usage for buffers with loose data', ({ root }) => {
      root.createBuffer(d.f32).$usage('storage', 'uniform', 'vertex');
      root.createBuffer(d.disarrayOf(d.f32, 1)).$usage('vertex');

      expect(() =>
        root
          .createBuffer(d.disarrayOf(d.f32, 1))
          //@ts-expect-error
          .$usage('storage')
      ).toThrow();
      expect(() =>
        root
          .createBuffer(d.disarrayOf(d.f32, 1))
          //@ts-expect-error
          .$usage('uniform')
      ).toThrow();

      root.createBuffer(d.unstruct({ a: d.u32 })).$usage('vertex');
      expect(() =>
        root
          .createBuffer(d.unstruct({ a: d.u32 }))
          //@ts-expect-error
          .$usage('storage')
      ).toThrow();
      expect(() =>
        root
          .createBuffer(d.unstruct({ a: d.u32 }))
          //@ts-expect-error
          .$usage('uniform')
      ).toThrow();
    });
  });

  describe('beginRenderPass', () => {
    const layout = tgpu.bindGroupLayout({ foo: { uniform: d.f32 } });

    // A vertex function that is using entries from the layout
    const mainVertexUsing = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })(() => {
      layout.$.foo;
      return {
        pos: d.vec4f(),
      };
    });

    // A vertex function that is using none of the layout's entries
    const mainVertexNotUsing = tgpu.vertexFn({
      out: {
        pos: d.builtin.position,
      },
    })(() => ({
      pos: d.vec4f(),
    }));

    const mainFragment = tgpu.fragmentFn({ out: Void })(() => {});

    it('ignores bind groups that are not used in the shader', ({ root, commandEncoder }) => {
      const group = root.createBindGroup(layout, {
        foo: root.createBuffer(d.f32).$usage('uniform'),
      });

      const pipeline = root.createRenderPipeline({
        vertex: mainVertexNotUsing,
        fragment: mainFragment,
      });

      root.beginRenderPass(
        {
          colorAttachments: [],
        },
        (pass) => {
          pass.setPipeline(pipeline);
          pass.setBindGroup(layout, group);
          pass.draw(1);
        },
      );

      const renderPassMock = commandEncoder.mock.beginRenderPass.mock.results[0]
        ?.value as GPURenderPassEncoder;
      expect(renderPassMock.setPipeline).toBeCalled();
      expect(renderPassMock.setBindGroup).not.toBeCalled();
    });

    it('accepts bind groups that are used in the shader', ({ root, commandEncoder }) => {
      const group = root.createBindGroup(layout, {
        foo: root.createBuffer(d.f32).$usage('uniform'),
      });

      const pipeline = root.createRenderPipeline({
        vertex: mainVertexUsing,
        fragment: mainFragment,
      });

      root.beginRenderPass(
        {
          colorAttachments: [],
        },
        (pass) => {
          pass.setPipeline(pipeline);
          pass.setBindGroup(layout, group);
          pass.draw(1);
        },
      );

      const renderPassMock = commandEncoder.mock.beginRenderPass.mock.results[0]
        ?.value as GPURenderPassEncoder;
      expect(renderPassMock.setPipeline).toBeCalled();
      expect(renderPassMock.setBindGroup).toBeCalledTimes(1);
      expect(renderPassMock.setBindGroup).toBeCalledWith(0, root.unwrap(group));
    });

    it('respects bind groups bound directly to pipelines', ({ root, commandEncoder }) => {
      const group = root.createBindGroup(layout, {
        foo: root.createBuffer(d.f32).$usage('uniform'),
      });

      const pipeline = root.createRenderPipeline({
        vertex: mainVertexUsing,
        fragment: mainFragment,
      }).with(group);

      root.beginRenderPass(
        {
          colorAttachments: [],
        },
        (pass) => {
          pass.setPipeline(pipeline);
          pass.draw(1);
        },
      );

      const renderPassMock = commandEncoder.mock.beginRenderPass.mock.results[0]
        ?.value as GPURenderPassEncoder;
      expect(renderPassMock.setPipeline).toBeCalled();
      expect(renderPassMock.setBindGroup).toBeCalledTimes(1);
      expect(renderPassMock.setBindGroup).toBeCalledWith(0, root.unwrap(group));
    });
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

  //   expect(buffer.vertexLayout).toStrictEqual({
  //     arrayStride: 4,
  //     stepMode: 'vertex',
  //   });
  // });
});
