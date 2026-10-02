import { describe, expect, vi } from 'vitest';
import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));

function createPipeline(root: TgpuRoot) {
  return root.createRenderPipeline({
    attribs: { position: vertexLayout.attrib },
    vertex: ({ position, $instanceIndex }) => {
      'use gpu';
      return { $position: d.vec4f(position, d.f32($instanceIndex), 1) };
    },
    fragment: () => {
      'use gpu';
      return d.vec4f(1);
    },
  });
}

function createGeometry(root: TgpuRoot) {
  const vertices = root
    .createBuffer(vertexLayout.schemaForCount(4), [
      d.vec2f(0, 0),
      d.vec2f(1, 0),
      d.vec2f(1, 1),
      d.vec2f(0, 1),
    ])
    .$usage('vertex');
  const indices = root.createBuffer(d.arrayOf(d.u32, 6), [0, 1, 2, 0, 2, 3]).$usage('index');
  return { vertices, indices };
}

function mockBaseVertexBaseInstance(gl: WebGL2RenderingContext) {
  const extension = {
    drawArraysInstancedBaseInstanceWEBGL: vi.fn(),
    drawElementsInstancedBaseVertexBaseInstanceWEBGL: vi.fn(),
  };
  vi.mocked(gl.getExtension as (name: string) => unknown).mockImplementation((name) =>
    name === 'WEBGL_draw_instanced_base_vertex_base_instance' ? extension : null,
  );
  return extension;
}

describe('TgpuRootWebGL - instanced draws', () => {
  it('draws the requested number of instances', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices } = createGeometry(root);

    createPipeline(root).with(vertexLayout, vertices).draw(4, 10, 1);

    expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 1, 4, 10);
    const vertexSource = vi.mocked(gl.shaderSource).mock.calls[0]?.[1];
    expect(vertexSource).toContain('(uint(gl_InstanceID) + _baseInstance)');
    expect(gl.uniform1ui).toHaveBeenCalledWith(expect.anything(), 0);
  });

  it('starts instance_index at firstInstance, like WGSL', ({ gl }) => {
    mockBaseVertexBaseInstance(gl);
    const root = initWithGL({ gl });
    const { vertices } = createGeometry(root);

    createPipeline(root).with(vertexLayout, vertices).draw(4, 2, 0, 5);

    // gl_InstanceID starts at 0 even with a base instance
    expect(gl.getUniformLocation).toHaveBeenCalledWith(expect.anything(), '_baseInstance');
    expect(gl.uniform1ui).toHaveBeenCalledWith(
      expect.objectContaining({ name: '_baseInstance' }),
      5,
    );
  });

  it('needs an extension to start at another instance', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices } = createGeometry(root);
    const pipeline = createPipeline(root).with(vertexLayout, vertices);

    expect(() => pipeline.draw(4, 2, 0, 1)).toThrow(
      "WebGL fallback does not support 'draw() with firstInstance'",
    );
  });

  it('starts at another instance with WEBGL_draw_instanced_base_vertex_base_instance', ({ gl }) => {
    const extension = mockBaseVertexBaseInstance(gl);
    const root = initWithGL({ gl });
    const { vertices } = createGeometry(root);

    createPipeline(root).with(vertexLayout, vertices).draw(4, 2, 0, 1);
    expect(extension.drawArraysInstancedBaseInstanceWEBGL).toHaveBeenCalledWith(
      gl.TRIANGLES,
      0,
      4,
      2,
      1,
    );
  });
});

describe('TgpuRootWebGL - indexed draws', () => {
  it('draws with a u32 index buffer bound to the vertex array', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices, indices } = createGeometry(root);

    const pipeline = createPipeline(root).with(vertexLayout, vertices).withIndexBuffer(indices);
    pipeline.drawIndexed(3, 2, 3);

    expect(pipeline.hasIndexBuffer).toBe(true);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 3, gl.UNSIGNED_INT, 12, 2);

    const indicesRaw = vi.mocked(gl.createBuffer).mock.results[1]?.value;
    const vao = vi.mocked(gl.createVertexArray).mock.results[0]?.value;
    const bindCalls = vi.mocked(gl.bindBuffer).mock.calls;
    const bindOrder = vi.mocked(gl.bindBuffer).mock.invocationCallOrder;
    const indexBindOrder =
      bindOrder[
        bindCalls.findLastIndex(([target, buffer]) => {
          return target === gl.ELEMENT_ARRAY_BUFFER && buffer === indicesRaw;
        })
      ] ?? Number.NaN;
    const vaoBindOrders = vi
      .mocked(gl.bindVertexArray)
      .mock.calls.flatMap(([bound], i) =>
        bound === vao
          ? [vi.mocked(gl.bindVertexArray).mock.invocationCallOrder[i] ?? Number.NaN]
          : [],
      );
    // Bound while setting up the vertex array, as it's part of its state
    expect(vaoBindOrders[0]).toBeLessThan(indexBindOrder);
    expect(indexBindOrder).toBeLessThan(vaoBindOrders[1] ?? Number.NaN);
  });

  it('applies the offset and size in elements', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices } = createGeometry(root);
    const indices = root.createBuffer(d.arrayOf(d.u16, 8)).$usage('index');
    const pipeline = createPipeline(root)
      .with(vertexLayout, vertices)
      .withIndexBuffer(indices, 2, 4);

    pipeline.drawIndexed(3, 1, 1);

    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 6, 1);
    expect(() => pipeline.drawIndexed(4, 1, 1)).toThrow(/out of bounds of the index buffer/);
  });

  it('takes an explicit index format, with the offset in bytes', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices } = createGeometry(root);
    const indices = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('index');

    createPipeline(root)
      .with(vertexLayout, vertices)
      // The WebGPU root only takes an index format with a GPUBuffer, which WebGL has none of
      .withIndexBuffer(indices as never, 'uint16', 4)
      .drawIndexed(6);

    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 4, 1);
  });

  it('validates the offset and size of index data', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices } = createGeometry(root);
    const indices = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('index');
    const pipeline = createPipeline(root).with(vertexLayout, vertices);

    expect(() => pipeline.withIndexBuffer(indices as never, 'uint32', 2)).toThrow(
      "The offset of 'uint32' index data has to be a multiple of 4 bytes, got 2.",
    );
    // A size past the end of the buffer is clamped to it
    expect(() =>
      pipeline.withIndexBuffer(indices as never, 'uint32', 8, 64).drawIndexed(4),
    ).toThrow(/out of bounds of the index buffer/);
  });

  it('needs an extension to offset the vertices or instances', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices, indices } = createGeometry(root);
    const pipeline = createPipeline(root).with(vertexLayout, vertices).withIndexBuffer(indices);

    expect(() => pipeline.drawIndexed(6, 1, 0, 2)).toThrow(
      "WebGL fallback does not support 'drawIndexed() with baseVertex or firstInstance'",
    );
  });

  it('offsets the vertices or instances with WEBGL_draw_instanced_base_vertex_base_instance', ({
    gl,
  }) => {
    const extension = mockBaseVertexBaseInstance(gl);
    const root = initWithGL({ gl });
    const { vertices, indices } = createGeometry(root);

    createPipeline(root)
      .with(vertexLayout, vertices)
      .withIndexBuffer(indices)
      .drawIndexed(6, 3, 0, 2, 1);
    expect(extension.drawElementsInstancedBaseVertexBaseInstanceWEBGL).toHaveBeenCalledWith(
      gl.TRIANGLES,
      6,
      gl.UNSIGNED_INT,
      0,
      3,
      2,
      1,
    );
  });

  it('throws for invalid index buffers', ({ gl }) => {
    const root = initWithGL({ gl });
    const { vertices, indices } = createGeometry(root);
    const pipeline = createPipeline(root).with(vertexLayout, vertices);

    expect(pipeline.hasIndexBuffer).toBe(false);
    expect(() =>
      (pipeline as unknown as { drawIndexed(count: number): void }).drawIndexed(3),
    ).toThrow(/No index buffer is set/);
    expect(() => pipeline.withIndexBuffer(root.createBuffer(d.arrayOf(d.f32, 3)) as never)).toThrow(
      'Index buffers must hold an array of u16 or u32 elements',
    );
    expect(() =>
      pipeline.withIndexBuffer(root.createBuffer(d.arrayOf(d.u32, 3)) as never).drawIndexed(3),
    ).toThrow("Buffer is not usable as an index buffer. Add .$usage('index').");
    expect(() => pipeline.withIndexBuffer(indices).drawIndexedIndirect(indices as never)).toThrow(
      "WebGL fallback does not support 'drawIndexedIndirect'",
    );
  });
});

describe('TgpuRootWebGL - instanced, indexed and depth-tested geometry', () => {
  it('draws a mesh the way a 3D scene does', ({ gl, createHTMLCanvas }) => {
    const root = initWithGL({ gl });
    const Vertex = d.struct({ position: d.vec3f, normal: d.vec3f });
    const meshLayout = tgpu.vertexLayout(d.arrayOf(Vertex));
    const instanceLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f), 'instance');
    const viewProj = root.createUniform(d.mat4x4f);

    const pipeline = root
      .createRenderPipeline({
        attribs: { ...meshLayout.attrib, offset: instanceLayout.attrib },
        vertex: tgpu.vertexFn({
          in: { position: d.vec3f, normal: d.vec3f, offset: d.vec4f },
          out: { pos: d.builtin.position, normal: d.vec3f },
        })((input) => {
          'use gpu';
          const world = d.vec4f(input.position + input.offset.xyz, 1);
          return { pos: viewProj.$ * world, normal: input.normal };
        }),
        fragment: tgpu.fragmentFn({ in: { normal: d.vec3f }, out: d.vec4f })((input) => {
          'use gpu';
          return d.vec4f(std.normalize(input.normal), 1);
        }),
        primitive: { cullMode: 'back' },
        depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      })
      .with(meshLayout, root.createBuffer(meshLayout.schemaForCount(24)).$usage('vertex'))
      .with(instanceLayout, root.createBuffer(instanceLayout.schemaForCount(100)).$usage('vertex'))
      .withIndexBuffer(root.createBuffer(d.arrayOf(d.u32, 36)).$usage('index'));

    const context = root.configureContext({ canvas: createHTMLCanvas({}) });
    const depthView = {} as never; // No depth texture, the canvas' depth buffer is used
    pipeline
      .withColorAttachment({ view: context, loadOp: 'clear', storeOp: 'store' })
      .withDepthStencilAttachment({
        view: depthView,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
        depthClearValue: 1,
      })
      .drawIndexed(36, 100);
    pipeline
      .withColorAttachment({ view: context, loadOp: 'load', storeOp: 'store' })
      .withDepthStencilAttachment({ view: depthView, depthLoadOp: 'load', depthStoreOp: 'store' })
      .drawIndexed(36, 100);

    expect(gl.clear).toHaveBeenCalledOnce();
    expect(gl.clear).toHaveBeenCalledWith(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    expect(gl.drawElementsInstanced).toHaveBeenCalledTimes(2);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(
      gl.TRIANGLES,
      36,
      gl.UNSIGNED_INT,
      0,
      100,
    );
    expect(gl.enable).toHaveBeenCalledWith(gl.DEPTH_TEST);
    expect(gl.enable).toHaveBeenCalledWith(gl.CULL_FACE);
    expect(gl.vertexAttribDivisor).toHaveBeenCalledWith(2, 1);
    expect(gl.createVertexArray).toHaveBeenCalledOnce();
  });
});
