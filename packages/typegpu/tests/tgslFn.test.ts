import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import { builtin } from '../src/builtin';
import { f32, location, struct, vec2f, vec3f, vec4f } from '../src/data';
import { parse } from './utils/parseResolved';
import { parseResolved } from './utils/parseResolved';

describe('TGSL tgpu.fn function', () => {
  it('is namable', () => {
    const getX = tgpu['~unstable']
      .fn(
        [],
        f32,
      )(() => {
        return 3;
      })
      .$name('get_x');

    expect(getX.label).toEqual('get_x');
  });

  it('resolves fn to WGSL', () => {
    const getY = tgpu['~unstable']
      .fn(
        [],
        f32,
      )(() => {
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
      .fn(
        [],
        vec3f,
      )(() => {
        const color = v();
        const color2 = v(1, 2, 3);
        return color;
      })
      .$uses({ v: vec3f })
      .$name('get_color');

    const getX = tgpu['~unstable']
      .fn(
        [],
        f32,
      )(() => {
        const color = getColor();
        return 3;
      })
      .$name('get_x')
      .$uses({ getColor });

    const getY = tgpu['~unstable']
      .fn(
        [],
        f32,
      )(() => {
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
      .fn(
        [],
        Gradient,
      )(() => {
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
      .fn(
        [],
        A,
      )(() => {
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
      .vertexFn({
        in: {
          vi: builtin.vertexIndex,
          ii: builtin.instanceIndex,
          color: vec4f,
        },
        out: {
          pos: builtin.position,
          uv: vec2f,
        },
      })((input) => {
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

  it('resolves computeFn', () => {
    const computeFn = tgpu['~unstable']
      .computeFn({
        in: { gid: builtin.globalInvocationId },
        workgroupSize: [24],
      })((input) => {
        const index = input.gid.x;
        const iterationF = f32(0);
        const sign = 0;
        const change = vec4f(0, 0, 0, 0);
      })
      .$name('compute_fn');

    const actual = parseResolved({ computeFn });

    const expected = parse(`
      struct compute_fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(24)
      fn compute_fn(input: compute_fn_Input) {
        var index = input.gid.x;
        var iterationF = f32(0);
        var sign = 0;
        var change = vec4f(0, 0, 0, 0);
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('rejects invalid arguments for computeFn', () => {
    const u = tgpu['~unstable'];

    // @ts-expect-error
    u.computeFn({ in: { vid: builtin.vertexIndex }, workgroupSize: [24] })(
      () => {},
    );

    // @ts-expect-error
    u.computeFn({
      in: { gid: builtin.globalInvocationId, random: f32 },
      workgroupSize: [24],
    })(() => {});
  });

  it('resolves fragmentFn', () => {
    const fragmentFn = tgpu['~unstable']
      .fragmentFn({
        in: {
          pos: builtin.position,
          uv: vec2f,
          sampleMask: builtin.sampleMask,
        },
        out: {
          sampleMask: builtin.sampleMask,
          fragDepth: builtin.fragDepth,
          out: location(0, vec4f),
        },
      })((input) => {
        const pos = input.pos;
        const out = {
          out: vec4f(0, 0, 0, 0),
          fragDepth: 1,
          sampleMask: 0,
        };
        if (input.sampleMask > 0 && pos.x > 0) {
          out.sampleMask = 1;
        }

        return out;
      })
      .$name('fragment_fn');

    const actual = parseResolved({ fragmentFn });

    const expected = parse(`
      struct fragment_fn_Output {
        @builtin(sample_mask) sampleMask: u32,
        @builtin(frag_depth) fragDepth: f32,
        @location(0) out: vec4f,
      }

      struct fragment_fn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      @fragment
      fn fragment_fn(input: fragment_fn_Input) -> fragment_fn_Output {
        var pos = input.pos;
        var out = fragment_fn_Output(0, 1, vec4f(0, 0, 0, 0));
        if (((input.sampleMask > 0) && (pos.x > 0))) {
          out.sampleMask = 1;
        }

        return out;
      }
    `);

    expect(actual).toEqual(expected);
  });

  it('resolves fragmentFn with a single output', () => {
    const fragmentFn = tgpu['~unstable']
      .fragmentFn({ in: { pos: builtin.position }, out: vec4f })((input) => {
        return input.pos;
      })
      .$name('fragment_fn');

    const actual = parseResolved({ fragmentFn });

    const expected = parse(`
      struct fragment_fn_Input {
        @builtin(position) pos: vec4f,
      }

      @fragment
      fn fragment_fn(input: fragment_fn_Input) -> @location(0) vec4f {
        return input.pos;
      }
    `);

    expect(actual).toEqual(expected);
  });

  // TODO: Add this back when we can properly infer ast types (and implement appropriate behavior for pointers)
  // it('resolves a function with a pointer parameter', () => {
  //   const addOnes = tgpu['~unstable']
  //     .fn([ptrStorage(vec3f, 'read-write')])
  //     ((ptr) => {
  //       ptr.x += 1;
  //       ptr.y += 1;
  //       ptr.z += 1;
  //     });

  //   const actual = parseResolved({ addOnes });
  //   console.log(tgpu.resolve({ externals: { addOnes }, template: 'addOnes' }));

  //   const expected = parse(`
  //     fn addOnes(ptr: ptr<storage, vec3f, read_write>) {
  //       (*ptr).x += 1;
  //       (*ptr).y += 1;
  //       (*ptr).z += 1;
  //     }
  //   `);

  //   expect(actual).toEqual(expected);
  // });
});
