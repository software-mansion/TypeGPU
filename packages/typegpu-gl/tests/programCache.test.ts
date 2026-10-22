import { describe, expect, vi } from 'vitest';
import { d, std } from 'typegpu';
import { initWithGL } from '../src/index.ts';
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

describe('TgpuRootWebGL - program cache', () => {
  it('links each source pair once and deletes every cached program once', ({ gl }) => {
    const root = initWithGL({ gl });

    // 25 pairs plus a distinct vertex shader: 51 pipelines, three source pairs.
    for (let i = 0; i < 25; i++) {
      root.createRenderPipeline(descriptor());
      root.createRenderPipeline(descriptor(0, 1));
    }
    root.createRenderPipeline(descriptor(0.5));

    expect(gl.createProgram).toHaveBeenCalledTimes(3);
    expect(gl.linkProgram).toHaveBeenCalledTimes(3);
    expect(gl.compileShader).toHaveBeenCalledTimes(6);

    root.destroy();
    root.destroy();
    expect(vi.mocked(gl.deleteProgram).mock.calls).toEqual(
      vi.mocked(gl.createProgram).mock.results.map(({ value }) => [value]),
    );
  });

  it('keeps uniforms, textures and samplers independent when programs are shared', ({ gl }) => {
    const root = initWithGL({ gl });
    const create = (color: d.v4f) => {
      const tint = root.createUniform(d.vec4f, color).$name('tint');
      const texture = root.createTexture({ size: [2, 2], format: 'rgba8unorm' }).$usage('sampled');
      const view = texture.createView();
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

    const colors: number[][] = [];
    vi.mocked(gl.uniform4fv).mockImplementation((_location, value) => {
      colors.push(Array.from(value));
    });
    vi.mocked(gl.bindTexture).mockClear();
    vi.mocked(gl.bindSampler).mockClear();
    a.pipeline.draw(3);
    b.pipeline.draw(3);
    a.tint.write(d.vec4f(0.5, 0, 0, 1));
    a.pipeline.draw(3);

    expect(colors).toEqual([
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
    ]);
    expect(vi.mocked(gl.bindSampler).mock.calls).toEqual([
      [0, samplers[0]],
      [0, samplers[1]],
      [0, samplers[0]],
    ]);
    const program = vi.mocked(gl.createProgram).mock.results[0]!.value;
    expect(vi.mocked(gl.useProgram).mock.calls).toEqual([[program], [program], [program]]);
    root.destroy();
  });

  it('does not share programs between roots, even with the same context', ({ gl }) => {
    const a = initWithGL({ gl });
    const b = initWithGL({ gl });
    a.createRenderPipeline(descriptor());
    const pipeline = b.createRenderPipeline(descriptor());
    expect(gl.createProgram).toHaveBeenCalledTimes(2);
    const programs = vi.mocked(gl.createProgram).mock.results.map(({ value }) => value);

    a.destroy();
    expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(programs[0]);
    pipeline.draw(3);
    expect(gl.useProgram).toHaveBeenLastCalledWith(programs[1]);
    b.destroy();
    expect(vi.mocked(gl.deleteProgram).mock.calls).toEqual(programs.map((program) => [program]));
  });

  it('retries compilation after a failed attempt', ({ gl }) => {
    const root = initWithGL({ gl });
    vi.mocked(gl.getShaderParameter).mockReturnValueOnce(false);
    expect(() => root.createRenderPipeline(descriptor())).toThrow('Shader compilation failed');
    root.createRenderPipeline(descriptor());
    root.createRenderPipeline(descriptor());
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    expect(gl.compileShader).toHaveBeenCalledTimes(3);
    root.destroy();
    expect(gl.deleteProgram).toHaveBeenCalledExactlyOnceWith(
      vi.mocked(gl.createProgram).mock.results[0]!.value,
    );
  });

  it('retries linking after a failed attempt and releases the successful program', ({ gl }) => {
    const root = initWithGL({ gl });
    vi.mocked(gl.getProgramParameter).mockReturnValueOnce(false);
    expect(() => root.createRenderPipeline(descriptor())).toThrow('Program linking failed');
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
