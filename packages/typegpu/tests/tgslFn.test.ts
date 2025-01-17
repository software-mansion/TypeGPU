import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import { f32, struct, vec3f } from '../src/data';
import { parseResolved } from './utils/parseResolved';

describe('TGSL tgpu.fn function', () => {
  it('is namable', () => {
    const getX = tgpu['~unstable']
      .fn([], f32)
      .does(() => {
        return 3;
      })
      .$name('get_x');

    expect(getX.label).toEqual('get_x');
  });

  it('resolves fn to WGSL', () => {
    const getY = tgpu['~unstable']
      .fn([], f32)
      .does(() => {
        return 3;
      })
      .$name('getY');

    const actual = parseResolved({ getY });

    const expected = parse(`
      fn getY() -> f32 {
        return 3;
      }`);

    expect(actual).toEqual(expected);
  });

  it('resolves externals', () => {
    const v = vec3f; // necessary workaround until we finish implementation of member access in the generator
    const getColor = tgpu['~unstable']
      .fn([], vec3f)
      .does(() => {
        const color = v();
        const color2 = v(1, 2, 3);
        return color;
      })
      .$uses({ v: vec3f })
      .$name('get_color');

    const getX = tgpu['~unstable']
      .fn([], f32)
      .does(() => {
        const color = getColor();
        return 3;
      })
      .$name('get_x')
      .$uses({ getColor });

    const getY = tgpu['~unstable']
      .fn([], f32)
      .does(() => {
        const c = getColor();
        return getX();
      })
      .$name('getY')
      .$uses({ getX, getColor });

    const actual = parseResolved({ getY });

    const expected = parse(`
      fn get_color() -> vec3f {
        var color = vec3f();
        var color2 = vec3f(1, 2, 3);
        return color;
      }

      fn get_x() -> f32 {
        var color = get_color();
        return 3;
      }

      fn getY() -> f32 {
        var c = get_color();
        return get_x();
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('resolves structs', () => {
    const Gradient = struct({
      from: vec3f,
      to: vec3f,
    });

    const createGradient = tgpu['~unstable']
      .fn([], Gradient)
      .does(() => {
        return Gradient({ to: vec3f(1, 2, 3), from: vec3f(4, 5, 6) });
      })
      .$name('create_gradient');

    const actual = parseResolved({ createGradient });

    const expected = parse(`
      struct Gradient {
        from: vec3f,
        to: vec3f,
      }

      fn create_gradient() -> Gradient {
        return Gradient(vec3f(4, 5, 6), vec3f(1, 2, 3));
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('resolves deeply nested structs', () => {
    const A = struct({
      b: f32,
    }).$name('A');

    const B = struct({
      a: A,
      c: f32,
    }).$name('B');

    const C = struct({
      b: B,
      a: A,
    }).$name('C');

    const pureConfusion = tgpu['~unstable']
      .fn([], A)
      .does(() => {
        return C({ a: A({ b: 3 }), b: B({ a: A({ b: 4 }), c: 5 }) }).a;
      })
      .$name('pure_confusion');

    const actual = parseResolved({ pureConfusion });

    const expected = parse(`
      struct A {
        b: f32,
      }

      struct B {
        a: A,
        c: f32,
      }

      struct C {
        b: B,
        a: A,
      }

      fn pure_confusion() -> A {
        return C(B(A(4), 5), A(3)).a;
      }
    `);

    expect(actual).toEqual(expected);
  });
});
