import { describe, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { dualGlOptions, glOptions, initWithGL } from '@typegpu/gl';
import { it } from './utils/extendedTest.ts';

describe('TgpuRootWebGL - createUniform', () => {
  // TODO(#2510): Unskip this if uniforms are backed by UBOs
  it.skip('creates a WebGL UBO-backed uniform', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.vec4f);
    expect(uniform).toBeDefined();
    expect(uniform.resourceType).toBe('uniform');

    expect(gl.createBuffer).toHaveBeenCalled();
  });

  // TODO(#2510): Unskip this if uniforms are backed by UBOs
  it.skip('creates a uniform with an initial value', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.f32, 42);
    expect(uniform).toBeDefined();
    // Should have called bufferData to set initial value
    expect(gl.bufferData).toHaveBeenCalled();
  });

  it('allows writing to the uniform', async ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.f32);
    uniform.write(1.0);

    expect(await uniform.read()).toBe(1.0);
  });
});

describe('TgpuRootWebGL - uniform bindings', () => {
  it('binds referenced uniforms from both stages and uploads subsequent writes', ({ gl }) => {
    const root = initWithGL({ gl });
    root.createUniform(d.f32, 99).$name('unused');
    const shared = root.createUniform(d.f32, 1).$name('factor');
    const offset = root.createUniform(d.f32, 0.5).$name('offset');
    const color = root.createUniform(d.vec4f, d.vec4f(1, 0, 0, 1)).$name('color');
    const optimizedOut = root.createUniform(d.f32, 2).$name('optimizedOut');
    vi.mocked(gl.getUniformLocation).mockImplementation((program, name) =>
      name === 'optimizedOut' ? null : ({ program, name } as unknown as WebGLUniformLocation),
    );
    function uniformLocation(programIndex: number, name: string): WebGLUniformLocation {
      const program = vi.mocked(gl.createProgram).mock.results[programIndex]?.value;
      const index = vi
        .mocked(gl.getUniformLocation)
        .mock.calls.findIndex(
          ([queriedProgram, queriedName]) => queriedProgram === program && queriedName === name,
        );
      expect(index).toBeGreaterThanOrEqual(0);
      return vi.mocked(gl.getUniformLocation).mock.results[index]?.value;
    }
    const descriptor = {
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(shared.$ + offset.$, 0, 0, 1) };
      },
      fragment: () => {
        'use gpu';
        return color.$ * shared.$ * optimizedOut.$;
      },
    };

    const pipeline = root.createRenderPipeline(descriptor);
    expect(
      vi
        .mocked(gl.getUniformLocation)
        .mock.calls.map(([, name]) => name)
        .toSorted(),
    ).toEqual(['color', 'factor', 'offset', 'optimizedOut']);

    shared.write(3);
    color.write(d.vec4f(0, 1, 0, 1));
    pipeline.draw(3);
    expect(gl.uniform1f).toHaveBeenCalledTimes(2);
    expect(vi.mocked(gl.uniform1f).mock.calls.find(([, value]) => value === 3)?.[0]).toBe(
      uniformLocation(0, 'factor'),
    );
    expect(vi.mocked(gl.uniform1f).mock.calls.find(([, value]) => value === 0.5)?.[0]).toBe(
      uniformLocation(0, 'offset'),
    );
    expect(gl.uniform4fv).toHaveBeenCalledExactlyOnceWith(
      uniformLocation(0, 'color'),
      new Float32Array([0, 1, 0, 1]),
    );
    expect(vi.mocked(gl.uniform4fv).mock.calls[0]?.[0]).toBe(uniformLocation(0, 'color'));

    // A uniform can be reused by a pipeline created later, too.
    vi.mocked(gl.uniform1f).mockClear();
    vi.mocked(gl.uniform4fv).mockClear();
    offset.write(0.75);
    root.createRenderPipeline(descriptor).draw(3);
    expect(gl.uniform1f).toHaveBeenCalledTimes(2);
    expect(vi.mocked(gl.uniform1f).mock.calls.find(([, value]) => value === 3)?.[0]).toBe(
      uniformLocation(1, 'factor'),
    );
    expect(vi.mocked(gl.uniform1f).mock.calls.find(([, value]) => value === 0.75)?.[0]).toBe(
      uniformLocation(1, 'offset'),
    );
    expect(gl.uniform4fv).toHaveBeenCalledExactlyOnceWith(
      uniformLocation(1, 'color'),
      new Float32Array([0, 1, 0, 1]),
    );
    expect(vi.mocked(gl.uniform4fv).mock.calls[0]?.[0]).toBe(uniformLocation(1, 'color'));
  });
});

describe('GlslGenerator - uniform resolution', () => {
  it('emits a uniform declaration and references the name in shader body', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);

    const fn = () => {
      'use gpu';
      return d.f32(time.$);
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float time;

      float fn_1() {
        return time;
      }"
    `);
  });

  it('shared uniforms are defined per shader stage, and share a name', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);
    const timeAlias = time;

    function vertexHelper() {
      'use gpu';
      return time.$ * 2;
    }

    function fragmentHelper() {
      'use gpu';
      // deliberately shadowing time to determine whether `time`
      // has already been reserved by the uniform.
      const time = 10.5;
      return timeAlias.$ * time;
    }

    const options = dualGlOptions();

    expect(tgpu.resolve([vertexHelper], { ...options.vertex })).toMatchInlineSnapshot(`
      "uniform float time;

      float vertexHelper() {
        return (time * 2.0);
      }"
    `);

    expect(tgpu.resolve([fragmentHelper], { ...options.fragment })).toMatchInlineSnapshot(`
      "uniform float time;

      float fragmentHelper() {
        float time_1 = 10.5;
        return (time * time_1);
      }"
    `);
  });

  it('emits a vec3f uniform as vec3', ({ gl }) => {
    const root = initWithGL({ gl });
    const color = root.createUniform(d.vec3f);

    const fn = () => {
      'use gpu';
      return d.vec3f(color.$);
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform vec3 color;

      vec3 fn_1() {
        return color;
      }"
    `);
  });

  it('emits multiple uniforms with the same label', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);
    const TIME = root.createUniform(d.f32).$name('time');

    const fn = () => {
      'use gpu';
      return time.$ * TIME.$;
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float time;

      uniform float time_1;

      float fn_1() {
        return (time * time_1);
      }"
    `);
  });

  it('emits a mat2x2f uniform as mat2', ({ gl }) => {
    const root = initWithGL({ gl });
    const transform = root.createUniform(d.mat2x2f);

    function fn(v: d.v2f) {
      'use gpu';
      return transform.$ * v;
    }

    function main() {
      'use gpu';
      return fn(d.vec2f(1, 2));
    }

    const result = tgpu.resolve([main], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform mat2 transform;

      vec2 fn_1(vec2 v) {
        return (transform * v);
      }

      vec2 main() {
        return fn_1(vec2(1, 2));
      }"
    `);
  });
});
