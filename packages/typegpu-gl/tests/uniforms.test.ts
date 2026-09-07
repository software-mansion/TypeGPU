import { describe, beforeEach, expect } from 'vitest';
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
