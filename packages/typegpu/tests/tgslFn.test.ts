import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import { builtin } from '../src/builtin';
import { f32, struct, vec2f, vec3f, vec4f } from '../src/data';
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

  it('resolves vertexFn', () => {
    const vertexFn = tgpu['~unstable']
      .vertexFn(
        {
          vi: builtin.vertexIndex,
          ii: builtin.instanceIndex,
          color: vec4f,
        },
        {
          pos: builtin.position,
          uv: vec2f,
        },
      )
      .does((input) => {
        const vi = input.vi;
        const ii = input.ii;
        const color = input.color;

        return {
          pos: vec4f(color.w, ii, vi, 1),
          uv: vec2f(color.w, vi),
        };
      })
      .$name('vertex_fn');

    const actual = parseResolved({ vertexFn });

    const expected = parse(`
      struct vertex_fn_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }
      struct vertex_fn_Input {
        @builtin(vertex_index) vi: u32,
        @builtin(instance_index) ii: u32,
        @location(0) color: vec4f,
      }

      @vertex fn vertex_fn(input: vertex_fn_Input) -> vertex_fn_Output{
        var vi = input.vi;
        var ii = input.ii;
        var color = input.color;
        return vertex_fn_Output(vec4f(color.w, ii, vi, 1), vec2f(color.w, vi));
      }
    `);

    expect(actual).toEqual(expected);
  });
});
