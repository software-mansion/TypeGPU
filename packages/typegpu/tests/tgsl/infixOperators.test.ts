import { describe, expect } from 'vitest';
import tgpu, { d } from '../../src/index.js';
import { it } from 'typegpu-testing-utility';

describe('wgslGenerator', () => {
  it('resolves add infix operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f().add(1);
      const v2 = d.vec3f(2).add(d.vec3f(1, 2, 3));
      const v3 = d.vec2f(3).add(d.vec2f(2)).add(1);
      const m1 = d.mat2x2f().add(d.mat2x2f());
      const m2 = d.mat3x3f().add(d.mat3x3f()).add(d.mat3x3f());
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        let v1 = vec4f(1);
        let v2 = vec3f(3, 4, 5);
        let v3 = vec2f(6);
        let m1 = mat2x2f(0, 0, 0, 0);
        let m2 = mat3x3f(0, 0, 0, 0, 0, 0, 0, 0, 0);
      }"
    `);
  });

  it('resolves sub infix operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f().sub(1);
      const v2 = d.vec3f().sub(d.vec3f(1, 2, 3));
      const v3 = d.vec2f(3).sub(d.vec2f(2)).sub(1);
      const m1 = d.mat2x2f().sub(d.mat2x2f());
      const m2 = d.mat3x3f().sub(d.mat3x3f()).sub(d.mat3x3f());
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        let v1 = vec4f(-1);
        let v2 = vec3f(-1, -2, -3);
        let v3 = vec2f();
        let m1 = mat2x2f(0, 0, 0, 0);
        let m2 = mat3x3f(0, 0, 0, 0, 0, 0, 0, 0, 0);
      }"
    `);
  });

  it('resolves mul infix operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec2f(2).mul(3);
      const v2 = d.vec3f(2).mul(d.vec3f(2, 3, 4));
      const v3 = d.vec4f().mul(d.mat4x4f());
      const v4 = d.vec3f().mul(d.mat3x3f()).mul(1);

      const m1 = d.mat2x2f().mul(1);
      const m2 = d.mat3x3f().mul(d.vec3f());
      const m3 = d.mat4x4f().mul(d.mat4x4f());
      const m4 = d.mat2x2f().mul(d.mat2x2f()).mul(1);
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        let v1 = vec2f(6);
        let v2 = vec3f(4, 6, 8);
        let v3 = vec4f();
        let v4 = vec3f();
        let m1 = mat2x2f(0, 0, 0, 0);
        let m2 = vec3f();
        let m3 = mat4x4f(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        let m4 = mat2x2f(0, 0, 0, 0);
      }"
    `);
  });

  it('resolves mul infix operator on a function return value', () => {
    const getVec = tgpu.fn(
      [],
      d.vec3f,
    )(() => {
      'use gpu';
      return d.vec3f(1, 2, 3);
    });

    const testFn = tgpu.fn([])(() => {
      'use gpu';
      const v1 = getVec().mul(getVec());
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn getVec() -> vec3f {
        return vec3f(1, 2, 3);
      }

      fn testFn() {
        let v1 = (getVec() * getVec());
      }"
    `);
  });

  it('resolves mul infix operator on a struct property', () => {
    const Struct = d.struct({ vec: d.vec3f });

    const testFn = tgpu.fn([])(() => {
      'use gpu';
      const s = Struct({ vec: d.vec3f() });
      const v1 = s.vec.mul(s.vec);
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "struct Struct {
        vec: vec3f,
      }

      fn testFn() {
        let s = Struct(vec3f());
        let v1 = (s.vec * s.vec);
      }"
    `);
  });

  it('resolves div infix operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f(1).div(2);
      const v2 = d.vec3f(6).div(d.vec3f(1, 2, 3));
      const v3 = d.vec2f(1).div(d.vec2f(2)).div(2);
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        let v1 = vec4f(0.5);
        let v2 = vec3f(6, 3, 2);
        let v3 = vec2f(0.25);
      }"
    `);
  });

  it('resolves mod infix operator', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f(11).mod(2);
      const v2 = d.vec3f(13.5).mod(d.vec3f(1, 2, 10));
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        let v1 = vec4f(1);
        let v2 = vec3f(0.5, 1.5, 3.5);
      }"
    `);
  });

  it('resolves add infix operator on uniform vector', ({ root }) => {
    const fooUniform = root.createUniform(d.vec3f);
    const barUniform = root.createUniform(d.vec3f);

    const testFn = tgpu.fn([])(() => {
      const v1 = fooUniform.$.add(2); // lhs
      const v2 = d.vec3f(1, 2, 3).add(barUniform.$); // rhs
      const v3 = fooUniform.$.add(barUniform.$);
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> fooUniform: vec3f;

      @group(0) @binding(1) var<uniform> barUniform: vec3f;

      fn testFn() {
        let v1 = (fooUniform + 2f);
        let v2 = (vec3f(1, 2, 3) + barUniform);
        let v3 = (fooUniform + barUniform);
      }"
    `);
  });

  it('precomputes adds on known values', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec3f(1, 2, 3).add(5);
      const v2 = d.vec3f(1, 2, 3).add(d.vec3f(3, 2, 1));
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        let v1 = vec3f(6, 7, 8);
        let v2 = vec3f(4);
      }"
    `);
  });
});
