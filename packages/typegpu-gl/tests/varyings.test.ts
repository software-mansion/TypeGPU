import { describe, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { dualGlOptions, initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

function resolveBothStages(
  vertex: Parameters<typeof tgpu.resolve>[0][number],
  fragment: Parameters<typeof tgpu.resolve>[0][number],
) {
  const options = dualGlOptions();
  return {
    vertex: tgpu.resolve([vertex, fragment], options.vertex),
    fragment: tgpu.resolve([vertex, fragment], options.fragment),
  };
}

describe('GlslGenerator - varying interpolation qualifiers', () => {
  it('declares integer varyings as flat on both sides', () => {
    const vertex = tgpu.vertexFn({
      out: { pos: d.builtin.position, id: d.u32, cell: d.vec2i, uv: d.vec2f },
    })(() => {
      'use gpu';
      return { pos: d.vec4f(), id: d.u32(1), cell: d.vec2i(2, 3), uv: d.vec2f() };
    });

    const fragment = tgpu.fragmentFn({
      in: { id: d.u32, cell: d.vec2i, uv: d.vec2f },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      return d.vec4f(input.uv, d.f32(input.id), d.f32(input.cell.x));
    });

    const { vertex: vertexGlsl, fragment: fragmentGlsl } = resolveBothStages(vertex, fragment);

    expect(vertexGlsl).toContain('flat out uint vary_id;');
    expect(vertexGlsl).toContain('flat out ivec2 vary_cell;');
    expect(vertexGlsl).toContain('\nout vec2 vary_uv;');
    expect(fragmentGlsl).toContain('flat in uint vary_id;');
    expect(fragmentGlsl).toContain('flat in ivec2 vary_cell;');
    expect(fragmentGlsl).toContain('\nin vec2 vary_uv;');
  });

  it('respects d.interpolate() on the vertex output', () => {
    const vertex = tgpu.vertexFn({
      out: {
        pos: d.builtin.position,
        flatColor: d.interpolate('flat', d.vec3f),
        edge: d.interpolate('perspective, centroid', d.f32),
        sampled: d.interpolate('perspective, sample', d.f32),
      },
    })(() => {
      'use gpu';
      return { pos: d.vec4f(), flatColor: d.vec3f(), edge: 0, sampled: 0 };
    });

    // The fragment side leaves out the decorations, the qualifiers still have to match
    const fragment = tgpu.fragmentFn({
      in: { flatColor: d.vec3f, edge: d.f32, sampled: d.f32 },
      out: d.vec4f,
    })((input) => {
      'use gpu';
      return d.vec4f(input.flatColor, input.edge + input.sampled);
    });

    using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { vertex: vertexGlsl, fragment: fragmentGlsl } = resolveBothStages(vertex, fragment);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("'sample' interpolation sampling"));

    expect(vertexGlsl).toContain('flat out vec3 vary_flatColor;');
    expect(vertexGlsl).toContain('centroid out float vary_edge;');
    expect(vertexGlsl).toContain('\nout float vary_sampled;');
    expect(fragmentGlsl).toContain('flat in vec3 vary_flatColor;');
    expect(fragmentGlsl).toContain('centroid in float vary_edge;');
    expect(fragmentGlsl).toContain('\nin float vary_sampled;');
  });

  it('throws for linear interpolation, which GLSL ES 3.00 cannot express', () => {
    const vertex = tgpu.vertexFn({
      out: { pos: d.builtin.position, t: d.interpolate('linear', d.f32) },
    })(() => {
      'use gpu';
      return { pos: d.vec4f(), t: 0 };
    });

    const fragment = tgpu.fragmentFn({ in: { t: d.f32 }, out: d.vec4f })((input) => {
      'use gpu';
      return d.vec4f(input.t);
    });

    expect(() => resolveBothStages(vertex, fragment)).toThrow(
      /WebGL fallback does not support 'linear interpolation'/,
    );
  });
});

describe('TgpuRootWebGL - provoking vertex', () => {
  it('uses the first vertex of a primitive for flat varyings, like WGSL', ({ gl }) => {
    const extension = {
      FIRST_VERTEX_CONVENTION_WEBGL: 0x8e4d,
      provokingVertexWEBGL: vi.fn(),
    };
    vi.mocked(gl.getExtension as (name: string) => unknown).mockImplementation((name) =>
      name === 'WEBGL_provoking_vertex' ? extension : null,
    );

    initWithGL({ gl });

    expect(extension.provokingVertexWEBGL).toHaveBeenCalledWith(0x8e4d);
  });

  it('warns when flat varyings would read the last vertex instead', ({ gl }) => {
    vi.mocked(gl.getExtension as (name: string) => unknown).mockImplementation(() => null);
    using warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const root = initWithGL({ gl });
    root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(), id: d.u32(0) };
      },
      fragment: ({ id }) => {
        'use gpu';
        return d.vec4f(d.f32(id));
      },
    });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WEBGL_provoking_vertex'));
  });
});
