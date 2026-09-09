import { describe, expect, vi } from 'vitest';
import { tgpu, d, common } from 'typegpu';
import { initWithGL } from '../src/index.ts';
import { it } from './utils/extendedTest.ts';

const Vertex = d.struct({ pos: d.vec3f, normal: d.vec3f });
const layout = tgpu.vertexLayout(d.arrayOf(Vertex));
const vertex = tgpu.vertexFn({
  in: { pos: d.location(3, d.vec3f), normal: d.vec3f },
  out: { position: d.builtin.position, normal: d.vec3f },
})((input) => {
  'use gpu';
  return { position: d.vec4f(input.pos, 1), normal: input.normal };
});
const fragment = tgpu.fragmentFn({ in: { normal: d.vec3f }, out: d.vec4f })((input) => {
  'use gpu';
  return d.vec4f(input.normal, 1);
});

describe('WebGL mesh rendering', () => {
  it('uploads padded SoA vertices and indexed draws with explicit attribute locations', ({
    gl,
  }) => {
    const root = initWithGL({ gl });
    const vertices = root
      .createBuffer(layout.schemaForCount(3), (buffer) => {
        common.writeSoA(buffer, {
          pos: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]),
          normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
        });
      })
      .$usage('vertex');
    const indices = root.createBuffer(d.arrayOf(d.u16, 3), [0, 1, 2]).$usage('index');
    const pipeline = root
      .createRenderPipeline({ attribs: layout.attrib, vertex, fragment })
      .with(layout, vertices)
      .withIndexBuffer(indices);
    pipeline.drawIndexed(2, 1, 1);

    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(3, 3, gl.FLOAT, false, 32, 0);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(0, 3, gl.FLOAT, false, 32, 16);
    expect(gl.drawElementsInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 2, gl.UNSIGNED_SHORT, 2, 1);
    const bytes = vi.mocked(gl.bufferData).mock.calls[0]?.[1] as unknown as ArrayBuffer;
    expect(Array.from(new Float32Array(bytes).slice(0, 8))).toEqual([0, 1, 2, 0, 0, 0, 1, 0]);
    expect(gl.bufferData).toHaveBeenCalledTimes(2);
    pipeline.drawIndexed(3);
    expect(gl.bufferData).toHaveBeenCalledTimes(2);
    indices.write([2, 1, 0]);
    pipeline.drawIndexed(3);
    expect(gl.bufferData).toHaveBeenCalledTimes(3);
    vertices.destroy();
    root.destroy();
    expect(gl.deleteBuffer).toHaveBeenCalledTimes(2);
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).toHaveBeenCalledTimes(1);
  });

  it('preserves depth between mesh draws and disables depth for post-processing', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = root.createTexture({ size: [16, 16], format: 'rgba8unorm' }).$usage('render');
    const depth = root.createTexture({ size: [16, 16], format: 'depth24plus' }).$usage('render');
    const colorView = color.createView('render');
    const depthView = depth.createView('render');
    const descriptor = {
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f(1);
      },
    };
    const pipeline = root.createRenderPipeline({
      ...descriptor,
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    pipeline
      .withColorAttachment({ view: colorView })
      .withDepthStencilAttachment({ view: depthView, depthClearValue: 1 })
      .draw(3);
    expect(gl.depthFunc).toHaveBeenCalledWith(gl.LESS);
    expect(gl.framebufferTexture2D).toHaveBeenLastCalledWith(
      gl.FRAMEBUFFER,
      gl.DEPTH_ATTACHMENT,
      gl.TEXTURE_2D,
      expect.anything(),
      0,
    );
    vi.mocked(gl.clear).mockClear();
    pipeline
      .withColorAttachment({ view: colorView, loadOp: 'load' })
      .withDepthStencilAttachment({ view: depthView, depthLoadOp: 'load' })
      .draw(3);
    expect(gl.clear).not.toHaveBeenCalled();
    root.createRenderPipeline(descriptor).draw(3);
    expect(gl.disable).toHaveBeenLastCalledWith(gl.DEPTH_TEST);
  });

  it('uploads struct matrices and array elements at their padded offsets', ({ gl }) => {
    const root = initWithGL({ gl });
    const schema = d.struct({ pad: d.f32, matrix: d.mat4x4f, tips: d.arrayOf(d.vec3f, 2) });
    const uniform = root
      .createUniform(schema, {
        pad: 7,
        matrix: d.mat4x4f(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2),
        tips: [d.vec3f(3, 4, 5), d.vec3f(6, 7, 8)],
      })
      .$name('settings');
    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        // Test type-checking enables noUncheckedIndexedAccess.
        // oxlint-disable-next-line typescript/no-unnecessary-type-assertion
        return { $position: uniform.$.matrix * d.vec4f(uniform.$.tips[1]!, 1) };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f(uniform.$.pad);
      },
    });
    pipeline.draw(3);
    expect(gl.uniformMatrix4fv).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'settings.matrix' }),
      false,
      new Float32Array(d.mat4x4f(2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2)),
    );
    expect(gl.uniform3fv).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'settings.tips[1]' }),
      new Float32Array([6, 7, 8]),
    );
    expect(() => uniform.buffer.destroy()).not.toThrow();
  });
});
