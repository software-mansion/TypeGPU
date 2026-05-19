import { describe, expect } from 'vitest';
import tgpu, { d } from '../../src/index.js';
import { it } from 'typegpu-testing-utility';

describe('wgslGenerator', () => {
  it('resolves add infix operator in comptime', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f().add(1);
      const v2 = d.vec3f(2).add(d.vec3f(1, 2, 3));
      const v3 = d.vec2f(3).add(d.vec2f(2)).add(1);
      const m1 = d.mat2x2f().add(d.mat2x2f());
      const m2 = d.mat3x3f().add(d.mat3x3f()).add(d.mat3x3f());
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        var v1 = vec4f(1);
        var v2 = vec3f(3, 4, 5);
        var v3 = vec2f(6);
        var m1 = mat2x2f(0, 0, 0, 0);
        var m2 = mat3x3f(0, 0, 0, 0, 0, 0, 0, 0, 0);
      }"
    `);
  });

  it('resolves sub infix operator in comptime', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f().sub(1);
      const v2 = d.vec3f().sub(d.vec3f(1, 2, 3));
      const v3 = d.vec2f(3).sub(d.vec2f(2)).sub(1);
      const m1 = d.mat2x2f().sub(d.mat2x2f());
      const m2 = d.mat3x3f().sub(d.mat3x3f()).sub(d.mat3x3f());
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        var v1 = vec4f(-1);
        var v2 = vec3f(-1, -2, -3);
        var v3 = vec2f();
        var m1 = mat2x2f(0, 0, 0, 0);
        var m2 = mat3x3f(0, 0, 0, 0, 0, 0, 0, 0, 0);
      }"
    `);
  });

  it('resolves mul infix operator in comptime', () => {
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
        var v1 = vec2f(6);
        var v2 = vec3f(4, 6, 8);
        var v3 = vec4f();
        var v4 = vec3f();
        var m1 = mat2x2f(0, 0, 0, 0);
        var m2 = vec3f();
        var m3 = mat4x4f(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        var m4 = mat2x2f(0, 0, 0, 0);
      }"
    `);
  });

  it('resolves div infix operator in comptime', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f(1).div(2);
      const v2 = d.vec3f(6).div(d.vec3f(1, 2, 3));
      const v3 = d.vec2f(1).div(d.vec2f(2)).div(2);
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        var v1 = vec4f(0.5);
        var v2 = vec3f(6, 3, 2);
        var v3 = vec2f(0.25);
      }"
    `);
  });

  it('resolves mod infix operator in comptime', () => {
    const testFn = tgpu.fn([])(() => {
      const v1 = d.vec4f(11).mod(2);
      const v2 = d.vec3f(13.5).mod(d.vec3f(1, 2, 10));
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() {
        var v1 = vec4f(1);
        var v2 = vec3f(0.5, 1.5, 3.5);
      }"
    `);
  });

  it('resolves mul infix operator on a runtime variable', () => {
    const testFn = () => {
      'use gpu';
      const v1 = d.vec2f(1, 2);
      return v1.mul(2).mul(3);
    };

    expect(testFn()).toStrictEqual(d.vec2f(6, 12));
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> vec2f {
        var v1 = vec2f(1, 2);
        return ((v1 * 2f) * 3f);
      }"
    `);
  });

  it('resolves mul infix operator on a function return value', () => {
    const getVec = () => {
      'use gpu';
      return d.vec3f(1, 2, 3);
    };

    const testFn = () => {
      'use gpu';
      return getVec().mul(getVec()).mul(2);
    };

    expect(testFn()).toStrictEqual(d.vec3f(2, 8, 18));
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn getVec() -> vec3f {
        return vec3f(1, 2, 3);
      }

      fn testFn() -> vec3f {
        return ((getVec() * getVec()) * 2f);
      }"
    `);
  });

  it('resolves mul infix operator on a struct property', () => {
    const Struct = d.struct({ vec: d.vec3f });

    const testFn = () => {
      'use gpu';
      const s = Struct({ vec: d.vec3f(2) });
      return s.vec.mul(s.vec).mul(2);
    };

    expect(testFn()).toStrictEqual(d.vec3f(8));
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "struct Struct {
        vec: vec3f,
      }

      fn testFn() -> vec3f {
        var s = Struct(vec3f(2));
        return ((s.vec * s.vec) * 2f);
      }"
    `);
  });

  it('resolves mul infix operator on uniform vector', ({ root }) => {
    const fooUniform = root.createUniform(d.vec3f);

    const testFn = tgpu.fn([])(() => {
      const v1 = fooUniform.$.mul(2); // lhs
      const v2 = d.vec3f(1, 2, 3).mul(fooUniform.$); // rhs
      const v3 = fooUniform.$.mul(fooUniform.$).mul(2);
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> fooUniform: vec3f;

      fn testFn() {
        var v1 = (fooUniform * 2f);
        var v2 = (vec3f(1, 2, 3) * fooUniform);
        var v3 = ((fooUniform * fooUniform) * 2f);
      }"
    `);
  });

  it('resolves mul infix operator on external', () => {
    const v = d.vec3f(2);

    const testFn = () => {
      'use gpu';
      const v1 = v.mul(2); // lhs
      const v2 = d.vec3f(3).mul(v); // rhs
      const v3 = v.mul(v).mul(4);
      return v1.add(v2).add(v3);
    };

    expect(testFn()).toStrictEqual(d.vec3f(26));
    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "fn testFn() -> vec3f {
        var v1 = vec3f(4);
        var v2 = vec3f(6);
        var v3 = vec3f(16);
        return ((v1 + v2) + v3);
      }"
    `);
  });

  it('resolves mul infix operator on accessors', () => {
    const vAccess = tgpu.accessor(d.vec2i, d.vec2i(1, 2));

    const main = () => {
      'use gpu';
      return vAccess.$.mul(2).mul(3);
    };

    // expect(main()).toMatchInlineSnapshot(d.vec2i(6, 12));
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> vec2i {
        return vec2i(6, 12);
      }"
    `);
  });

  it('correctly casts types', () => {
    const main = () => {
      'use gpu';
      const a = d.u32(1);
      const b = d.vec3f(2);
      return b.mul(a);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn main() -> vec3f {
        const a = 1u;
        var b = vec3f(2);
        return (b * f32(a));
      }"
    `);
  });
});
