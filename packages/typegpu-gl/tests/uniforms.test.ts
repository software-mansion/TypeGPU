import { describe, beforeEach, expect } from 'vitest';
import tgpu, { d } from 'typegpu';
import { glOptions, initWithGL } from '@typegpu/gl';
import { _resetUniformCounter } from '../src/tgpuRootWebGL.ts';
import { it } from './utils/extendedTest.ts';

describe('TgpuRootWebGL - createUniform', () => {
  it('creates a WebGL UBO-backed uniform', ({ gl }) => {
    const root = initWithGL({ gl });

    const uniform = root.createUniform(d.vec4f);
    expect(uniform).toBeDefined();
    expect(uniform.resourceType).toBe('uniform');

    expect(gl.createBuffer).toHaveBeenCalled();
  });

  it('creates a uniform with an initial value', ({ gl }) => {
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
  beforeEach(() => {
    _resetUniformCounter();
  });

  it('emits a uniform declaration and references the name in shader body', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);

    const fn = () => {
      'use gpu';
      return d.f32(time.$);
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float _u0;

      float fn_1() {
        return _u0;
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
      "uniform vec3 _u0;

      vec3 fn_1() {
        return _u0;
      }"
    `);
  });

  it('emits multiple uniforms with sequential names', ({ gl }) => {
    const root = initWithGL({ gl });
    const time = root.createUniform(d.f32);
    const scale = root.createUniform(d.f32);

    const fn = () => {
      'use gpu';
      return time.$ * scale.$;
    };

    const result = tgpu.resolve([fn], glOptions());
    expect(result).toMatchInlineSnapshot(`
      "uniform float _u0;

      uniform float _u1;

      float fn_1() {
        return (_u0 * _u1);
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
      "uniform mat2 _u0;

      vec2 fn_1(vec2 v) {
        return (_u0 * v);
      }

      vec2 main() {
        return fn_1(vec2(1, 2));
      }"
    `);
  });
});
