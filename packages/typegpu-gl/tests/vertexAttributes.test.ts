import { describe, expect, vi } from 'vitest';
import { d, tgpu } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import { vertexFormatInfo, type VertexFormat } from '../src/vertexFormats.ts';
import { it } from './utils/extendedTest.ts';

const Vertex = d.struct({ position: d.vec3f, normal: d.vec3f, part: d.u32 });
const vertexLayout = tgpu.vertexLayout(d.arrayOf(Vertex));
const instanceLayout = tgpu.vertexLayout(d.arrayOf(d.vec4f), 'instance');

const vertex = tgpu.vertexFn({
  in: { position: d.vec3f, normal: d.vec3f, part: d.u32, offset: d.vec4f },
  out: { pos: d.builtin.position, normal: d.vec3f },
})((input) => {
  'use gpu';
  return {
    pos: d.vec4f(input.position + input.offset.xyz, d.f32(input.part)),
    normal: input.normal,
  };
});

const fragment = tgpu.fragmentFn({ in: { normal: d.vec3f }, out: d.vec4f })((input) => {
  'use gpu';
  return d.vec4f(input.normal, 1);
});

function createPipeline(root: ReturnType<typeof initWithGL>) {
  return root.createRenderPipeline({
    attribs: { ...vertexLayout.attrib, offset: instanceLayout.attrib },
    vertex,
    fragment,
  });
}

describe('vertex formats', () => {
  it('covers every vertex format of TypeGPU', ({ gl }) => {
    for (const format of Object.keys(d.formatToWGSLType) as VertexFormat[]) {
      const info = vertexFormatInfo[format];
      expect(gl[info.type], format).toBeTypeOf('number');
      // Integer formats are read as integers by the shader, and nothing else is
      expect(info.integer, format).toBe(/^[us]int/.test(format));
      expect(info.normalized, format).toBe(/norm/.test(format));
    }
  });

  it.for([
    ['float32x3', { size: 3, type: 'FLOAT', normalized: false, integer: false }],
    ['float16x2', { size: 2, type: 'HALF_FLOAT', normalized: false, integer: false }],
    ['unorm8x4', { size: 4, type: 'UNSIGNED_BYTE', normalized: true, integer: false }],
    ['snorm16', { size: 1, type: 'SHORT', normalized: true, integer: false }],
    ['uint32', { size: 1, type: 'UNSIGNED_INT', normalized: false, integer: true }],
    ['sint8x2', { size: 2, type: 'BYTE', normalized: false, integer: true }],
    [
      'unorm10-10-10-2',
      { size: 4, type: 'UNSIGNED_INT_2_10_10_10_REV', normalized: true, integer: false },
    ],
    [
      'unorm8x4-bgra',
      { size: 4, type: 'UNSIGNED_BYTE', normalized: true, integer: false, swizzle: 'zyxw' },
    ],
  ] as const)('maps %s', ([format, expected]) => {
    expect(vertexFormatInfo[format]).toStrictEqual(expected);
  });
});

describe('TgpuRootWebGL - vertex buffers', () => {
  it('binds attributes to the locations of the vertex inputs', ({ gl }) => {
    const root = initWithGL({ gl });
    const vertices = root.createBuffer(vertexLayout.schemaForCount(3)).$usage('vertex');
    const instances = root.createBuffer(instanceLayout.schemaForCount(2)).$usage('vertex');

    createPipeline(root).with(vertexLayout, vertices).with(instanceLayout, instances).draw(3);

    const [verticesRaw, instancesRaw] = vi
      .mocked(gl.createBuffer)
      .mock.results.map((result) => result.value);
    expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ARRAY_BUFFER, verticesRaw);
    expect(gl.bindBuffer).toHaveBeenCalledWith(gl.ARRAY_BUFFER, instancesRaw);

    // Struct layout: position, normal (vec3f, 16-byte aligned) and part
    expect(vertexLayout.stride).toBe(32);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(0, 3, gl.FLOAT, false, 32, 0);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(1, 3, gl.FLOAT, false, 32, 16);
    expect(gl.vertexAttribIPointer).toHaveBeenCalledWith(2, 1, gl.UNSIGNED_INT, 32, 28);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(3, 4, gl.FLOAT, false, 16, 0);
    for (const location of [0, 1, 2, 3]) {
      expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(location);
    }
    expect(gl.vertexAttribDivisor).toHaveBeenCalledWith(0, 0);
    expect(gl.vertexAttribDivisor).toHaveBeenCalledWith(3, 1);

    const vertexSource = vi.mocked(gl.shaderSource).mock.calls[0]?.[1];
    expect(vertexSource).toContain('layout(location=2) in uint _in_part;');
    expect(vertexSource).toContain('layout(location=3) in vec4 _in_offset;');
  });

  it('rejects a single attribute for a record of vertex inputs, like the WebGPU root', ({ gl }) => {
    const root = initWithGL({ gl });
    const layout = tgpu.vertexLayout(d.arrayOf(d.vec2f));

    expect(() =>
      root.createRenderPipeline({
        // Rejected by the types, but not in JS
        attribs: layout.attrib as never,
        vertex: tgpu.vertexFn({
          in: { corner: d.vec2f, offset: d.vec2f },
          out: { pos: d.builtin.position },
        })((input) => {
          'use gpu';
          return { pos: d.vec4f(input.corner + input.offset, 0, 1) };
        }),
        fragment: () => {
          'use gpu';
          return d.vec4f(1);
        },
      }),
    ).toThrow("An attribute by the name of 'corner' was not provided to the shader.");
  });

  it('sets up the vertex array once per set of buffers', ({ gl }) => {
    const root = initWithGL({ gl });
    const vertices = root.createBuffer(vertexLayout.schemaForCount(3)).$usage('vertex');
    const otherVertices = root.createBuffer(vertexLayout.schemaForCount(3)).$usage('vertex');
    const instances = root.createBuffer(instanceLayout.schemaForCount(2)).$usage('vertex');
    const pipeline = createPipeline(root).with(instanceLayout, instances);

    pipeline.with(vertexLayout, vertices).draw(3);
    pipeline.with(vertexLayout, vertices).draw(3);
    expect(gl.createVertexArray).toHaveBeenCalledOnce();
    expect(gl.vertexAttribPointer).toHaveBeenCalledTimes(3);

    pipeline.with(vertexLayout, otherVertices).draw(3);
    expect(gl.createVertexArray).toHaveBeenCalledTimes(2);

    const [firstVao, secondVao] = vi
      .mocked(gl.createVertexArray)
      .mock.results.map((result) => result.value);
    vi.mocked(gl.bindVertexArray).mockClear();
    pipeline.with(vertexLayout, vertices).draw(3);
    expect(gl.bindVertexArray).toHaveBeenCalledWith(firstVao);

    // Destroying a buffer releases the vertex arrays that use it
    otherVertices.destroy();
    expect(gl.deleteVertexArray).toHaveBeenCalledWith(secondVao);
    expect(gl.deleteVertexArray).not.toHaveBeenCalledWith(firstVao);
  });

  it('uploads data written since the last draw', ({ gl }) => {
    const root = initWithGL({ gl });
    const instances = root.createBuffer(instanceLayout.schemaForCount(2)).$usage('vertex');
    const vertices = root.createBuffer(vertexLayout.schemaForCount(3)).$usage('vertex');
    const pipeline = createPipeline(root)
      .with(vertexLayout, vertices)
      .with(instanceLayout, instances);
    pipeline.draw(3);
    instances.write([d.vec4f(1), d.vec4f(2)]);
    pipeline.draw(3);

    instances.write([d.vec4f(3)], { startOffset: 16 });
    vi.mocked(gl.bindVertexArray).mockClear();
    pipeline.draw(3);

    expect(gl.bufferSubData).toHaveBeenCalledWith(
      gl.ARRAY_BUFFER,
      16,
      new Uint8Array(new Float32Array([3, 3, 3, 3]).buffer),
    );
    // Uploaded without a vertex array bound
    expect(vi.mocked(gl.bufferSubData).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(gl.bindVertexArray).mock.invocationCallOrder[1] ?? Number.NaN,
    );
    expect(gl.createVertexArray).toHaveBeenCalledOnce();
  });

  it('reorders the components of unorm8x4-bgra in the shader', ({ gl }) => {
    const root = initWithGL({ gl });
    const layout = tgpu.vertexLayout(
      d.disarrayOf(d.unstruct({ position: d.float32x2, color: d.unorm8x4_bgra })),
    );
    const buffer = root.createBuffer(layout.schemaForCount(3)).$usage('vertex');

    root
      .createRenderPipeline({
        attribs: layout.attrib,
        vertex: ({ position, color }) => {
          'use gpu';
          return { $position: d.vec4f(position, 0, 1), color };
        },
        fragment: ({ color }) => {
          'use gpu';
          return d.vec4f(color);
        },
      })
      .with(layout, buffer)
      .draw(3);

    const vertexSource = vi.mocked(gl.shaderSource).mock.calls[0]?.[1];
    expect(vertexSource).toContain('layout(location=1) in vec4 _in_color;');
    expect(vertexSource).toMatch(/_in_color\.zyxw/);
    expect(gl.vertexAttribPointer).toHaveBeenCalledWith(1, 4, gl.UNSIGNED_BYTE, true, 12, 8);
  });

  it('reads unorm8x4-bgra into inputs with fewer components', ({ gl }) => {
    const root = initWithGL({ gl });
    const layout = tgpu.vertexLayout(
      d.disarrayOf(d.unstruct({ rgb: d.unorm8x4_bgra, r: d.unorm8x4_bgra })),
    );

    root.createRenderPipeline({
      attribs: layout.attrib,
      vertex: tgpu.vertexFn({
        in: { rgb: d.vec3f, r: d.f32 },
        out: { pos: d.builtin.position },
      })(({ rgb, r }) => {
        'use gpu';
        return { pos: d.vec4f(rgb, r) };
      }),
      fragment: () => {
        'use gpu';
        return d.vec4f(1);
      },
    });

    const vertexSource = vi.mocked(gl.shaderSource).mock.calls[0]?.[1];
    expect(vertexSource).toContain('layout(location=0) in vec4 _in_rgb;');
    expect(vertexSource).toContain('layout(location=1) in vec4 _in_r;');
    expect(vertexSource).toMatch(/_in_rgb\.zyx\b/);
    expect(vertexSource).toMatch(/_in_r\.z\b/);
  });

  it('throws when signed and unsigned integers are mixed up', ({ gl }) => {
    const root = initWithGL({ gl });
    const layout = tgpu.vertexLayout(d.disarrayOf(d.unstruct({ cell: d.sint8x2 })));

    expect(() =>
      root.createRenderPipeline({
        // Rejected by the types, but not in JS
        attribs: layout.attrib as never,
        vertex: tgpu.vertexFn({ in: { cell: d.vec2u }, out: { pos: d.builtin.position } })(
          ({ cell }) => {
            'use gpu';
            return { pos: d.vec4f(d.vec2f(cell), 0, 1) };
          },
        ),
        fragment: () => {
          'use gpu';
          return d.vec4f(1);
        },
      }),
    ).toThrow("Vertex attribute 'cell' of format 'sint8x2' cannot be read as 'vec2u'.");
  });

  it('throws for missing or unusable vertex buffers', ({ gl }) => {
    const root = initWithGL({ gl });
    const pipeline = createPipeline(root);
    const instances = root.createBuffer(instanceLayout.schemaForCount(2)).$usage('vertex');
    const notVertex = root.createBuffer(vertexLayout.schemaForCount(3));

    expect(() => pipeline.with(instanceLayout, instances).draw(3)).toThrow(
      /Missing vertex buffer for layout/,
    );
    expect(() =>
      pipeline
        .with(instanceLayout, instances)
        .with(vertexLayout, notVertex as never)
        .draw(3),
    ).toThrow("Buffer is not usable as a vertex buffer. Add .$usage('vertex').");
  });

  it('throws for strides WebGL 2 does not support', ({ gl }) => {
    const root = initWithGL({ gl });
    const wide = tgpu.vertexLayout(
      d.arrayOf(d.struct({ a: d.vec4f, padding: d.align(256, d.f32) })),
    );

    expect(() =>
      root.createRenderPipeline({
        attribs: { a: wide.attrib.a },
        vertex: ({ a }) => {
          'use gpu';
          return { $position: a };
        },
        fragment: () => {
          'use gpu';
          return d.vec4f(1);
        },
      }),
    ).toThrow("WebGL fallback does not support 'vertex layouts with a stride of 512 bytes'");
  });

  it('only binds vertex layouts with .with()', ({ gl }) => {
    const root = initWithGL({ gl });
    const layout = tgpu.bindGroupLayout({ value: { uniform: d.f32 } });

    expect(() => createPipeline(root).with(layout, {} as never)).toThrow(
      "WebGL fallback does not support 'pipeline.with(bind-group-layout)'",
    );
  });
});
