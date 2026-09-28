import { describe, expect, vi } from 'vitest';
import { d, std } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

function descriptor(depth = 0, blue = 0) {
  return {
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f(0, 0, depth, 1) };
    },
    fragment: () => {
      'use gpu';
      return d.vec4f(1, 0, blue, 1);
    },
  };
}

/** The VAO that was bound during each draw */
function drawnVertexArrays(gl: WebGL2RenderingContext) {
  const binds = vi.mocked(gl.bindVertexArray).mock;
  return vi.mocked(gl.drawArrays).mock.invocationCallOrder.map((drawOrder) => {
    const lastBind = binds.invocationCallOrder.findLastIndex((order) => order < drawOrder);
    return binds.calls[lastBind]?.[0];
  });
}

describe('TgpuRootWebGL - program cache', () => {
  it('links each full source pair once, uses it on draws and deletes it once', ({ gl }) => {
    const root = initWithGL({ gl });

    // Fresh descriptors and closures must still share programs by generated source.
    const variants = [
      [0, 0],
      [0, 1],
      [0.5, 0],
      [0.5, 1],
    ] as const;
    const pipelines = Array.from({ length: 13 }, () =>
      variants.map(([depth, blue]) => root.createRenderPipeline(descriptor(depth, blue))),
    ).flat();

    expect(gl.createProgram).toHaveBeenCalledTimes(4);
    expect(gl.linkProgram).toHaveBeenCalledTimes(4);
    expect(gl.compileShader).toHaveBeenCalledTimes(8);
    // VAOs are only created for drawing
    expect(gl.createVertexArray).not.toHaveBeenCalled();

    const shaders = vi.mocked(gl.createShader).mock.results.map(({ value }) => value);
    const programs = vi.mocked(gl.createProgram).mock.results.map(({ value }) => value);
    const sources = vi.mocked(gl.shaderSource).mock.calls.map(([, source]) => source);
    expect(vi.mocked(gl.createShader).mock.calls).toEqual(
      variants.flatMap(() => [[gl.VERTEX_SHADER], [gl.FRAGMENT_SHADER]]),
    );
    expect(vi.mocked(gl.shaderSource).mock.calls.map(([shader]) => shader)).toEqual(shaders);
    expect(vi.mocked(gl.compileShader).mock.calls).toEqual(shaders.map((shader) => [shader]));
    expect(vi.mocked(gl.deleteShader).mock.calls).toEqual(shaders.map((shader) => [shader]));
    expect(sources[0]).toBe(sources[2]);
    expect(sources[4]).toBe(sources[6]);
    expect(sources[0]).not.toBe(sources[4]);
    expect(sources[1]).toBe(sources[5]);
    expect(sources[3]).toBe(sources[7]);
    expect(sources[1]).not.toBe(sources[3]);
    expect(vi.mocked(gl.attachShader).mock.calls).toEqual(
      shaders.map((shader, i) => [programs[Math.floor(i / 2)], shader]),
    );
    for (const pipeline of pipelines) pipeline.draw(3);
    expect(vi.mocked(gl.useProgram).mock.calls).toEqual(
      pipelines.map((_, i) => [programs[i % variants.length]]),
    );
    // Pipelines without vertex attributes share one VAO
    expect(gl.createVertexArray).toHaveBeenCalledOnce();
    const vao = vi.mocked(gl.createVertexArray).mock.results[0]!.value;
    expect(drawnVertexArrays(gl)).toEqual(pipelines.map(() => vao));
    expect(gl.deleteProgram).not.toHaveBeenCalled();
    expect(gl.deleteVertexArray).not.toHaveBeenCalled();

    root.destroy();
    root.destroy();
    expect(vi.mocked(gl.deleteProgram).mock.calls).toEqual(programs.map((program) => [program]));
    expect(gl.deleteVertexArray).toHaveBeenCalledExactlyOnceWith(vao);
    expect(() => root.createRenderPipeline(descriptor())).toThrow(/destroyed/i);
    expect(gl.createProgram).toHaveBeenCalledTimes(4);
    expect(gl.createVertexArray).toHaveBeenCalledTimes(1);
  });

  it('creates no VAO for a root that never draws', ({ gl }) => {
    const root = initWithGL({ gl });
    root.createRenderPipeline(descriptor());

    root.destroy();
    root.destroy();
    expect(gl.createVertexArray).not.toHaveBeenCalled();
    expect(gl.deleteVertexArray).not.toHaveBeenCalled();
  });

  it('draws again after a VAO fails to be created', ({ gl }) => {
    const root = initWithGL({ gl });
    const pipeline = root.createRenderPipeline(descriptor());
    vi.mocked<() => WebGLVertexArrayObject | null>(gl.createVertexArray).mockReturnValueOnce(null);

    expect(() => pipeline.draw(3)).toThrow('Failed to create VAO');
    expect(gl.drawArrays).not.toHaveBeenCalled();
    expect(gl.deleteVertexArray).not.toHaveBeenCalled();

    pipeline.draw(3);
    expect(gl.createVertexArray).toHaveBeenCalledTimes(2);
    const vao = vi.mocked(gl.createVertexArray).mock.results[1]!.value;
    expect(drawnVertexArrays(gl)).toEqual([vao]);
    expect(gl.drawArrays).toHaveBeenCalledOnce();
    root.destroy();
    expect(gl.deleteVertexArray).toHaveBeenCalledExactlyOnceWith(vao);
  });

  it('keeps the shared VAO and cached program usable after binding discovery fails', ({ gl }) => {
    const root = initWithGL({ gl });
    const tint = root.createUniform(d.vec4f, d.vec4f(1, 0, 0, 1));
    const pipelineDescriptor = {
      ...descriptor(),
      fragment: () => {
        'use gpu';
        return d.vec4f(tint.$);
      },
    };
    const pipeline = root.createRenderPipeline(pipelineDescriptor);
    const failure = new Error('binding discovery failed');
    vi.mocked(gl.getUniformLocation).mockImplementationOnce(() => {
      throw failure;
    });
    expect(() => root.createRenderPipeline(pipelineDescriptor)).toThrow(failure);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteVertexArray).not.toHaveBeenCalled();
    expect(gl.deleteProgram).not.toHaveBeenCalled();

    pipeline.draw(3);
    root.createRenderPipeline(pipelineDescriptor).draw(3);
    expect(gl.createVertexArray).toHaveBeenCalledOnce();
    const vao = vi.mocked(gl.createVertexArray).mock.results[0]!.value;
    expect(drawnVertexArrays(gl)).toEqual([vao, vao]);
    expect(gl.uniform4fv).toHaveBeenCalledTimes(2);
    expect(gl.createVertexArray).toHaveBeenCalledTimes(1);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    root.destroy();
    expect(gl.deleteVertexArray).toHaveBeenCalledExactlyOnceWith(vao);
    expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(
      vi.mocked(gl.createProgram).mock.results[0]!.value,
    );
  });

  it('keeps uniforms, textures and samplers independent when programs are shared', ({ gl }) => {
    const root = initWithGL({ gl });
    const create = (color: d.v4f) => {
      const tint = root.createUniform(d.vec4f, color).$name('tint');
      const texture = root.createTexture({ size: [2, 2], format: 'rgba8unorm' }).$usage('sampled');
      const view = texture.createView().$name('image');
      const sampler = root.createSampler({});
      const pipeline = root.createRenderPipeline({
        vertex: () => {
          'use gpu';
          return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
        },
        fragment: ({ uv }) => {
          'use gpu';
          return std.mul(std.textureSample(view.$, sampler.$, uv), tint.$);
        },
      });
      return { tint, pipeline };
    };
    const a = create(d.vec4f(1, 0, 0, 1));
    const b = create(d.vec4f(0, 1, 0, 1));
    expect(a.pipeline).not.toBe(b.pipeline);
    expect(gl.linkProgram).toHaveBeenCalledTimes(1);

    const locationNames = new Map(
      vi
        .mocked(gl.getUniformLocation)
        .mock.results.map(({ value }, i) => [
          value,
          vi.mocked(gl.getUniformLocation).mock.calls[i]![1],
        ]),
    );
    const colors: number[][] = [];
    vi.mocked(gl.uniform4fv).mockImplementation((location, value) => {
      expect(locationNames.get(location)).toBe('tint');
      colors.push(Array.from(value));
    });
    vi.mocked(gl.bindTexture).mockClear();
    vi.mocked(gl.bindSampler).mockClear();
    a.pipeline.draw(3);
    b.pipeline.draw(3);
    // Program uniforms keep the last draw's values, even if this pipeline's data is unchanged.
    a.pipeline.draw(3);
    b.pipeline.draw(3);
    a.tint.write(d.vec4f(0.5, 0, 0, 1));
    a.pipeline.draw(3);

    expect(colors).toEqual([
      [1, 0, 0, 1],
      [0, 1, 0, 1],
      [1, 0, 0, 1],
      [0, 1, 0, 1],
      [0.5, 0, 0, 1],
    ]);
    const textures = vi.mocked(gl.createTexture).mock.results.map(({ value }) => value);
    const samplers = vi.mocked(gl.createSampler).mock.results.map(({ value }) => value);
    expect(vi.mocked(gl.bindTexture).mock.calls).toEqual([
      [gl.TEXTURE_2D, textures[0]],
      [gl.TEXTURE_2D, textures[1]],
      [gl.TEXTURE_2D, textures[0]],
      [gl.TEXTURE_2D, textures[1]],
      [gl.TEXTURE_2D, textures[0]],
    ]);
    expect(vi.mocked(gl.bindSampler).mock.calls).toEqual([
      [0, samplers[0]],
      [0, samplers[1]],
      [0, samplers[0]],
      [0, samplers[1]],
      [0, samplers[0]],
    ]);
    expect(gl.createVertexArray).toHaveBeenCalledOnce();
    const vao = vi.mocked(gl.createVertexArray).mock.results[0]!.value;
    expect(drawnVertexArrays(gl)).toEqual(Array.from({ length: 5 }, () => vao));
    const program = vi.mocked(gl.createProgram).mock.results[0]!.value;
    expect(vi.mocked(gl.useProgram).mock.calls).toEqual(Array.from({ length: 5 }, () => [program]));
    expect(vi.mocked(gl.getUniformLocation).mock.calls.every(([p]) => p === program)).toBe(true);
    expect(
      vi
        .mocked(gl.uniform1i)
        .mock.calls.map(([location, value]) => [locationNames.get(location), value]),
    ).toEqual(
      Array.from({ length: 5 }, () => [
        ['image', 0],
        ['image_flipY', 0],
      ]).flat(),
    );
    root.destroy();
  });

  it('restores texture orientation when switching pipelines sharing a program', ({ gl }) => {
    const root = initWithGL({ gl });
    const create = () => {
      const texture = root
        .createTexture({ size: [2, 2], format: 'rgba8unorm' })
        .$usage('render', 'sampled');
      const view = texture.createView().$name('image');
      const sampler = root.createSampler({});
      const pipeline = root.createRenderPipeline({
        vertex: () => {
          'use gpu';
          return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
        },
        fragment: ({ uv }) => {
          'use gpu';
          return std.textureSample(view.$, sampler.$, uv);
        },
      });
      return { texture, pipeline };
    };
    const a = create();
    const b = create();
    const render = root.createRenderPipeline(descriptor());
    expect(gl.linkProgram).toHaveBeenCalledTimes(2);
    render.withColorAttachment({ view: a.texture.createView('render') }).draw(3);

    vi.mocked(gl.uniform1i).mockClear();
    a.pipeline.draw(3);
    b.pipeline.draw(3);
    a.pipeline.draw(3);
    a.texture.write(new Uint8Array(2 * 2 * 4));
    a.pipeline.draw(3);

    const locationNames = new Map(
      vi
        .mocked(gl.getUniformLocation)
        .mock.results.map(({ value }, i) => [
          value,
          vi.mocked(gl.getUniformLocation).mock.calls[i]![1],
        ]),
    );
    const flips = vi
      .mocked(gl.uniform1i)
      .mock.calls.filter(([location]) => locationNames.get(location) === 'image_flipY')
      .map(([, value]) => value);
    expect(flips).toEqual([1, 0, 1, 0]);
    root.destroy();
  });

  it('does not share programs or VAOs between roots, even with the same context', ({ gl }) => {
    const a = initWithGL({ gl });
    const b = initWithGL({ gl });
    a.createRenderPipeline(descriptor()).draw(3);
    const pipeline = b.createRenderPipeline(descriptor());
    pipeline.draw(3);
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    const programs = vi.mocked(gl.createProgram).mock.results.map(({ value }) => value);
    expect(gl.createVertexArray).toHaveBeenCalledTimes(2);
    const vaos = vi.mocked(gl.createVertexArray).mock.results.map(({ value }) => value);
    expect(vaos[0]).not.toBe(vaos[1]);
    expect(drawnVertexArrays(gl)).toEqual(vaos);

    a.destroy();
    expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(programs[0]);
    expect(gl.deleteVertexArray).toHaveBeenCalledExactlyOnceWith(vaos[0]);
    pipeline.draw(3);
    expect(gl.useProgram).toHaveBeenLastCalledWith(programs[1]);
    expect(drawnVertexArrays(gl).at(-1)).toBe(vaos[1]);
    b.destroy();
    expect(vi.mocked(gl.deleteProgram).mock.calls).toEqual(programs.map((program) => [program]));
    expect(vi.mocked(gl.deleteVertexArray).mock.calls).toEqual(vaos.map((vao) => [vao]));
  });

  for (const stage of ['vertex', 'fragment'] as const) {
    it(`retries after ${stage} compilation fails and releases its shaders`, ({ gl }) => {
      const root = initWithGL({ gl });
      if (stage === 'fragment') vi.mocked(gl.getShaderParameter).mockReturnValueOnce(true);
      vi.mocked(gl.getShaderParameter).mockReturnValueOnce(false);
      expect(() => root.createRenderPipeline(descriptor())).toThrow('Shader compilation failed');
      const failedShaders = vi.mocked(gl.createShader).mock.results.map(({ value }) => value);
      expect(gl.deleteShader).toHaveBeenCalledTimes(failedShaders.length);
      expect(vi.mocked(gl.deleteShader).mock.calls).toEqual(
        expect.arrayContaining(failedShaders.map((shader) => [shader])),
      );
      expect(gl.createProgram).not.toHaveBeenCalled();
      root.createRenderPipeline(descriptor());
      root.createRenderPipeline(descriptor());
      expect(gl.createProgram).toHaveBeenCalledTimes(1);
      expect(gl.compileShader).toHaveBeenCalledTimes(stage === 'vertex' ? 3 : 4);
      root.destroy();
      expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(
        vi.mocked(gl.createProgram).mock.results[0]!.value,
      );
    });
  }

  for (const stage of ['vertex', 'fragment', 'program'] as const) {
    it(`retries after ${stage} allocation fails and releases its shaders`, ({ gl }) => {
      const root = initWithGL({ gl });
      if (stage === 'program') {
        vi.mocked<() => WebGLProgram | null>(gl.createProgram).mockReturnValueOnce(null);
      } else {
        const createShader = vi.mocked(gl.createShader);
        if (stage === 'fragment')
          createShader.mockImplementationOnce(createShader.getMockImplementation()!);
        createShader.mockReturnValueOnce(null);
      }
      expect(() => root.createRenderPipeline(descriptor())).toThrow(
        stage === 'program' ? 'Failed to create WebGL program' : 'Failed to create WebGL shader',
      );
      const failedShaders = vi
        .mocked(gl.createShader)
        .mock.results.map(({ value }) => value)
        .filter((shader) => shader !== null);
      expect(gl.deleteShader).toHaveBeenCalledTimes(failedShaders.length);
      expect(vi.mocked(gl.deleteShader).mock.calls).toEqual(
        expect.arrayContaining(failedShaders.map((shader) => [shader])),
      );
      expect(gl.deleteProgram).not.toHaveBeenCalled();
      root.createRenderPipeline(descriptor());
      root.createRenderPipeline(descriptor());
      expect(gl.linkProgram).toHaveBeenCalledTimes(1);
      root.destroy();
      expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(
        vi.mocked(gl.linkProgram).mock.calls[0]![0],
      );
    });
  }

  for (const stage of ['compilation', 'linking'] as const) {
    it(`keeps cached programs usable after a different source pair fails ${stage}`, ({ gl }) => {
      const root = initWithGL({ gl });
      root.createRenderPipeline(descriptor());
      const program = vi.mocked(gl.createProgram).mock.results[0]!.value;
      if (stage === 'compilation') {
        vi.mocked(gl.getShaderParameter).mockReturnValueOnce(false);
      } else {
        vi.mocked(gl.getProgramParameter).mockReturnValueOnce(false);
      }
      expect(() => root.createRenderPipeline(descriptor(0, 1))).toThrow(
        stage === 'compilation' ? 'Shader compilation failed' : 'Program linking failed',
      );
      const compileCount = vi.mocked(gl.compileShader).mock.calls.length;
      const linkCount = vi.mocked(gl.linkProgram).mock.calls.length;
      root.createRenderPipeline(descriptor()).draw(3);
      expect(gl.compileShader).toHaveBeenCalledTimes(compileCount);
      expect(gl.linkProgram).toHaveBeenCalledTimes(linkCount);
      expect(gl.useProgram).toHaveBeenLastCalledWith(program);
      expect(vi.mocked(gl.deleteProgram).mock.calls.some(([p]) => p === program)).toBe(false);
      root.destroy();
    });
  }

  it('retries linking after a failed attempt and releases the successful program', ({ gl }) => {
    const root = initWithGL({ gl });
    vi.mocked(gl.getProgramParameter).mockReturnValueOnce(false);
    expect(() => root.createRenderPipeline(descriptor())).toThrow('Program linking failed');
    const failedProgram = vi.mocked(gl.createProgram).mock.results[0]!.value;
    expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(failedProgram);
    expect(gl.deleteShader).toHaveBeenCalledTimes(2);
    root.createRenderPipeline(descriptor());
    root.createRenderPipeline(descriptor());
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    expect(gl.linkProgram).toHaveBeenCalledTimes(2);
    root.destroy();
    expect(vi.mocked(gl.deleteProgram).mock.calls).toEqual(
      vi.mocked(gl.createProgram).mock.results.map(({ value }) => [value]),
    );
  });
});
