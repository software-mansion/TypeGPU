import { attest } from '@ark/attest';
import { describe, expect, it } from 'vitest';
import { builtin } from '../src/builtin.ts';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { getName } from '../src/shared/meta.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('TGSL tgpu.fn function', () => {
  it('is namable', () => {
    const getX = tgpu.fn([], d.f32)(() => 3).$name('get_x');

    expect(getName(getX)).toBe('get_x');
  });

  it('resolves to WGSL', () => {
    const getY = tgpu.fn([], d.f32)(() => 3);

    expect(parseResolved({ getY })).toBe(parse(`
      fn getY() -> f32 {
        return 3;
      }`));
  });

  it('resolves externals', () => {
    const getColor = tgpu.fn([], d.vec3f)(() => {
      const color = d.vec3f();
      const color2 = d.vec3f(1, 2, 3);
      return color;
    })
      .$uses({ v: d.vec3f });

    const getX = tgpu.fn([], d.f32)(() => {
      const color = getColor();
      return 3;
    })
      .$uses({ getColor });

    const getY = tgpu.fn([], d.f32)(() => {
      const c = getColor();
      return getX();
    })
      .$uses({ getX, getColor });

    const actual = parseResolved({ getY });

    const expected = parse(`
      fn getColor() -> vec3f {
        var color = vec3f();
        var color2 = vec3f(1, 2, 3);
        return color;
      }

      fn getX() -> f32 {
        var color = getColor();
        return 3;
      }

      fn getY() -> f32 {
        var c = getColor();
        return getX();
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves structs', () => {
    const Gradient = d.struct({
      from: d.vec3f,
      to: d.vec3f,
    });

    const createGradient = tgpu.fn([], Gradient)(() => {
      return Gradient({ to: d.vec3f(1, 2, 3), from: d.vec3f(4, 5, 6) });
    });

    const actual = parseResolved({ createGradient });

    const expected = parse(`
      struct Gradient {
        from: vec3f,
        to: vec3f,
      }

      fn createGradient() -> Gradient {
        return Gradient(vec3f(4, 5, 6), vec3f(1, 2, 3));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves deeply nested structs', () => {
    const A = d.struct({
      b: d.f32,
    });

    const B = d.struct({
      a: A,
      c: d.f32,
    });

    const C = d.struct({
      b: B,
      a: A,
    });

    const pureConfusion = tgpu.fn([], A)(() => {
      return C({ a: A({ b: 3 }), b: B({ a: A({ b: 4 }), c: 5 }) }).a;
    });

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

      fn pureConfusion() -> A {
        return C(B(A(4), 5), A(3)).a;
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves vertexFn', () => {
    const vertexFn = tgpu['~unstable']
      .vertexFn({
        in: {
          vi: builtin.vertexIndex,
          ii: builtin.instanceIndex,
          color: d.vec4f,
        },
        out: {
          pos: builtin.position,
          uv: d.vec2f,
        },
      })((input) => {
        const vi = d.f32(input.vi);
        const ii = d.f32(input.ii);
        const color = input.color;

        return {
          pos: d.vec4f(color.w, ii, vi, 1),
          uv: d.vec2f(color.w, vi),
        };
      })
      .$name('vertex_fn');

    const actual = parseResolved({ vertexFn });

    const expected = parse(`
      struct vertex_fn_Input {
        @builtin(vertex_index) vi: u32,
        @builtin(instance_index) ii: u32,
        @location(0) color: vec4f,
      }

      struct vertex_fn_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertex_fn(input: vertex_fn_Input) -> vertex_fn_Output{
        var vi = f32(input.vi);
        var ii = f32(input.ii);
        var color = input.color;
        return vertex_fn_Output(vec4f(color.w, ii, vi, 1), vec2f(color.w, vi));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves vertexFn with empty in', () => {
    const vertexFn = tgpu['~unstable'].vertexFn({
      out: { pos: d.builtin.position },
    })(() => ({ pos: d.vec4f() }));

    const actual = parseResolved({ vertexFn });

    const expected = parse(`
      struct vertexFn_Output {
        @builtin(position) pos: vec4f,
      }

      @vertex fn vertexFn() -> vertexFn_Output{
        return vertexFn_Output(vec4f());
      }
    `);

    expect(actual).toBe(expected);
  });

  it('throws when vertexFn with empty out', () => {
    expect(() =>
      tgpu['~unstable'].vertexFn({
        in: { vi: builtin.vertexIndex },
        out: {},
      })
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A vertexFn output cannot be empty since it must include the 'position' builtin.]`,
    );
  });

  it('allows destructuring the input argument in vertexFn', () => {
    const vertexFn = tgpu['~unstable']
      .vertexFn({
        in: {
          vi: builtin.vertexIndex,
          ii: builtin.instanceIndex,
          color: d.vec4f,
        },
        out: {
          pos: builtin.position,
          uv: d.vec2f,
        },
      })(({ vi, ii, color }) => {
        return {
          pos: d.vec4f(d.f32(color.w), d.f32(ii), d.f32(vi), 1),
          uv: d.vec2f(d.f32(color.w), vi),
        };
      })
      .$name('vertex_fn');

    const actual = parseResolved({ vertexFn });

    const expected = parse(`
      struct vertex_fn_Input {
        @builtin(vertex_index) vi: u32,
        @builtin(instance_index) ii: u32,
        @location(0) color: vec4f,
      }

      struct vertex_fn_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertex_fn(_arg_0: vertex_fn_Input) -> vertex_fn_Output {
        return vertex_fn_Output(vec4f(f32(_arg_0.color.w), f32(_arg_0.ii), f32(_arg_0.vi), 1), vec2f(f32(_arg_0.color.w), f32(_arg_0.vi)));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves computeFn', () => {
    const computeFn = tgpu['~unstable']
      .computeFn({
        in: { gid: builtin.globalInvocationId },
        workgroupSize: [24],
      })((input) => {
        const index = input.gid.x;
        const iterationF = d.f32(0);
        const sign = 0;
        const change = d.vec4f(0, 0, 0, 0);
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

    expect(actual).toBe(expected);
  });

  it('allows destructuring the input argument in computeFn', () => {
    const computeFn = tgpu['~unstable']
      .computeFn({
        in: { gid: builtin.globalInvocationId },
        workgroupSize: [24],
      })(({ gid }) => {
        const index = gid.x;
        const iterationF = d.f32(0);
        const sign = 0;
        const change = d.vec4f(0, 0, 0, 0);
      })
      .$name('compute_fn');

    const actual = parseResolved({ computeFn });

    const expected = parse(`
      struct compute_fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(24)
      fn compute_fn(_arg_0: compute_fn_Input) {
        var index = _arg_0.gid.x;
        var iterationF = f32(0);
        var sign = 0;
        var change = vec4f(0, 0, 0, 0);
      }
    `);

    expect(actual).toBe(expected);
  });

  it('rejects invalid arguments for computeFn', () => {
    const u = tgpu['~unstable'];

    // @ts-expect-error
    u.computeFn({ in: { vid: builtin.vertexIndex }, workgroupSize: [24] })(
      () => {},
    );

    // @ts-expect-error
    u.computeFn({
      in: { gid: builtin.globalInvocationId, random: d.f32 },
      workgroupSize: [24],
    })(() => {});
  });

  it('resolves fragmentFn', () => {
    const fragmentFn = tgpu['~unstable']
      .fragmentFn({
        in: {
          pos: builtin.position,
          uv: d.vec2f,
          sampleMask: builtin.sampleMask,
        },
        out: {
          sampleMask: builtin.sampleMask,
          fragDepth: builtin.fragDepth,
          out: d.location(0, d.vec4f),
        },
      })((input) => {
        const pos = input.pos;
        const out = {
          out: d.vec4f(0, 0, 0, 0),
          fragDepth: 1,
          sampleMask: 0,
        };
        if (input.sampleMask > 0 && pos.x > 0) {
          out.sampleMask = 1;
        }

        return out;
      });

    const actual = parseResolved({ fragmentFn });

    const expected = parse(`
      struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      struct fragmentFn_Output {
        @builtin(sample_mask) sampleMask: u32,
        @builtin(frag_depth) fragDepth: f32,
        @location(0) out: vec4f,
      }

      @fragment
      fn fragmentFn(input: fragmentFn_Input) -> fragmentFn_Output {
        var pos = input.pos;
        var out = fragmentFn_Output(0, 1, vec4f(0, 0, 0, 0));
        if (((input.sampleMask > 0) && (pos.x > 0))) {
          out.sampleMask = 1;
        }

        return out;
      }
    `);

    expect(actual).toBe(expected);
  });

  it('allows destructuring the input argument in fragmentFn', () => {
    const fragmentFn = tgpu['~unstable']
      .fragmentFn({
        in: {
          pos: builtin.position,
          uv: d.vec2f,
          sampleMask: builtin.sampleMask,
        },
        out: {
          sampleMask: builtin.sampleMask,
          fragDepth: builtin.fragDepth,
          out: d.location(0, d.vec4f),
        },
      })(({ pos: position, sampleMask }) => {
        const out = {
          out: d.vec4f(0, 0, 0, 0),
          fragDepth: 1,
          sampleMask: 0,
        };
        if (sampleMask > 0 && position.x > 0) {
          out.sampleMask = 1;
        }

        return out;
      });

    const actual = parseResolved({ fragmentFn });

    const expected = parse(`
      struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      struct fragmentFn_Output {
        @builtin(sample_mask) sampleMask: u32,
        @builtin(frag_depth) fragDepth: f32,
        @location(0) out: vec4f,
      }

      @fragment
      fn fragmentFn(_arg_0: fragmentFn_Input) -> fragmentFn_Output {
        var out = fragmentFn_Output(0, 1, vec4f(0, 0, 0, 0));
        if (((_arg_0.sampleMask > 0) && (_arg_0.pos.x > 0))) {
          out.sampleMask = 1;
        }

        return out;
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves fragmentFn with a single output', () => {
    const fragmentFn = tgpu['~unstable']
      .fragmentFn({ in: { pos: builtin.position }, out: d.vec4f })((input) => {
        return input.pos;
      });

    const actual = parseResolved({ fragmentFn });

    const expected = parse(`
      struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
      }

      @fragment
      fn fragmentFn(input: fragmentFn_Input) -> @location(0) vec4f {
        return input.pos;
      }
    `);

    expect(actual).toBe(expected);
  });

  it('allows for an object based on return type struct to be returned', () => {
    const TestStruct = d
      .struct({
        a: d.f32,
        b: d.f32,
        c: d.vec2f,
      });

    const getTestStruct = tgpu.fn([], TestStruct)(() => {
      return {
        a: 1,
        b: 2,
        c: d.vec2f(3, 4),
      };
    });

    const actual = parseResolved({ getTestStruct });

    const expected = parse(`
      struct TestStruct {
        a: f32,
        b: f32,
        c: vec2f,
      }

      fn getTestStruct() -> TestStruct {
        return TestStruct(1, 2, vec2f(3, 4));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('correctly handles object based on return type struct with a function call inside another function', () => {
    const TestStruct = d
      .struct({
        a: d.f32,
        b: d.f32,
        c: d.vec2f,
      });

    const getTestStruct = tgpu.fn([], TestStruct)(() => {
      return {
        a: 1,
        b: 2,
        c: d.vec2f(3, 4),
      };
    });

    const fn2 = tgpu['~unstable']
      .computeFn({
        in: { gid: builtin.globalInvocationId },
        workgroupSize: [24],
      })((input) => {
        const testStruct = getTestStruct();
      })
      .$name('compute_fn');

    const actual = parseResolved({ fn2 });

    const expected = parse(`
      struct compute_fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      struct TestStruct {
        a: f32,
        b: f32,
        c: vec2f,
      }

      fn getTestStruct() -> TestStruct {
        return TestStruct(1, 2, vec2f(3, 4));
      }

      @compute @workgroup_size(24)
      fn compute_fn(input: compute_fn_Input) {
        var testStruct = getTestStruct();
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves its header based on the shell, not AST, allowing passing function accepting a subset of arguments', () => {
    const foo = tgpu.fn([d.u32, d.u32], d.u32)((a) => a);

    expect(parseResolved({ foo })).toBe(
      parse(`fn foo(a: u32, _arg_1: u32) -> u32 {
        return a;
      }`),
    );
  });

  it('resolves its header based on the shell, not AST, allowing passing function with no arguments', () => {
    const foo = tgpu.fn([d.u32, d.u32], d.u32)(() => 2);

    expect(parseResolved({ foo })).toBe(
      parse(`fn foo(_arg_0: u32, _arg_1: u32) -> u32 {
        return 2;
      }`),
    );
  });

  it('(when using plugin) can be invoked for a constant with "kernel" directive', () => {
    const addKernelJs = (x: number, y: number) => {
      'kernel';
      return x + y;
    };

    const add = tgpu.fn([d.u32, d.u32])(addKernelJs);

    expect(addKernelJs(2, 3)).toBe(5);
    expect(add(2, 3)).toBe(5);
    expect(parseResolved({ add })).toBe(
      parse(`fn add(x: u32, y: u32){
          return (x + y);
        }`),
    );
  });

  it('(when using plugin) can be invoked for inline function with no directive', () => {
    const add = tgpu.fn([d.u32, d.u32])(
      (x, y) => x + y,
    );

    expect(add(2, 3)).toBe(5);
    expect(parseResolved({ add })).toBe(
      parse(`fn add(x: u32, y: u32){
          return (x + y);
        }`),
    );
  });

  it('resolves a function with a pointer parameter', () => {
    const addOnes = tgpu.fn([d.ptrStorage(d.vec3f, 'read-write')])((ptr) => {
      ptr.x += 1;
      ptr.y += 1;
      ptr.z += 1;
    });

    const actual = parseResolved({ addOnes });

    const expected = parse(`
      fn addOnes(ptr: ptr<storage, vec3f, read_write>) {
        (*ptr).x += 1;
        (*ptr).y += 1;
        (*ptr).z += 1;
      }
    `);

    expect(actual).toEqual(expected);

    const callAddOnes = tgpu.fn([])(() => {
      const someVec = d.vec3f(1, 2, 3);
      addOnes(someVec);
    });

    const actualCall = parseResolved({ callAddOnes });

    const expectedCall = parse(`
      fn addOnes(ptr: ptr<storage, vec3f, read_write>) {
        (*ptr).x += 1;
        (*ptr).y += 1;
        (*ptr).z += 1;
      }

      fn callAddOnes() {
        var someVec = vec3f(1, 2, 3);
        addOnes(&someVec);
      }
    `);

    expect(actualCall).toEqual(expectedCall);
  });

  it('allows destructuring the input struct argument', () => {
    const Input = d.struct({
      value: d.i32,
    }).$name('Input');

    const fun = tgpu.fn([Input])(({ value }) => {
      const vector = d.vec2u(value);
    });

    const actual = parseResolved({ fun });

    const expected = parse(`
      struct Input {
        value: i32,
      }

      fn fun(_arg_0: Input) {
        var vector = vec2u(u32(_arg_0.value));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('correctly coerces type of input arguments', () => {
    const Input = d.struct({
      value: d.i32,
    });

    const fun = tgpu.fn([Input])((input) => {
      const vector = d.vec2u(input.value);
    });

    const actual = parseResolved({ fun });

    const expected = parse(`
      struct Input {
        value: i32,
      }

      fn fun(input: Input) {
        var vector = vec2u(u32(input.value));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('correctly coerces type of destructured aliased input arguments', () => {
    const Input = d.struct({
      value: d.i32,
    });

    const fun = tgpu.fn([Input])(({ value: v }) => {
      const vector = d.vec2u(v);
    });

    const actual = parseResolved({ fun });

    const expected = parse(`
      struct Input {
        value: i32,
      }

      fn fun(_arg_0: Input) {
        var vector = vec2u(u32(_arg_0.value));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('allows destructuring any struct argument', () => {
    const Input = d.struct({
      value: d.i32,
    });

    const fun = tgpu.fn([Input, d.i32, Input])(({ value: v }, x, { value }) => {
      const vector = d.vec3u(v, x, value);
    });

    const actual = parseResolved({ fun });

    const expected = parse(`
      struct Input {
        value: i32,
      }

      fn fun(_arg_0: Input, x: i32, _arg_2: Input) {
        var vector = vec3u(u32(_arg_0.value), u32(x), u32(_arg_2.value));
      }
    `);

    expect(actual).toBe(expected);
  });

  it('maintains argument names in the type', () => {
    const fun = tgpu.fn([d.f32, d.f32], d.f32)((x, y) => {
      return x + y;
    });

    attest(fun).type.toString.snap('TgpuFn<(x: F32, y: F32) => F32>');
  });

  it('falls back to args_N naming when not every argument is used in the implementation', () => {
    const fun = tgpu.fn([d.f32, d.f32], d.f32)((x) => {
      return x * 2;
    });

    attest(fun).type.toString.snap('TgpuFn<(args_0: F32, args_1: F32) => F32>');
  });
});

describe('tgpu.fn arguments', () => {
  it('casts u32', () => {
    const fn = tgpu['~unstable'].fn([d.u32], d.f32)((e) => {
      'kernel & js';
      return e;
    });

    const result = fn(3.14);

    expect(result).toBe(3);
  });

  it('returns a copy of a float vector', () => {
    const vec = d.vec3f(1, 2, 3);
    const fn = tgpu['~unstable'].fn([d.vec3f], d.vec3f)((e) => {
      'kernel & js';
      return e;
    });

    const clone = fn(vec);

    expect(clone).toStrictEqual(vec);
    expect(clone).not.toBe(vec);
  });

  it('returns a copy of a bool vector', () => {
    const vec = d.vec4b(false, true, false, true);
    const fn = tgpu['~unstable'].fn([d.vec4b], d.vec4b)((e) => {
      'kernel & js';
      return e;
    });

    const clone = fn(vec);

    expect(clone).toStrictEqual(vec);
    expect(clone).not.toBe(vec);
  });

  it('returns a copy of a matrix', () => {
    const mat = d.mat2x2f(1, 2, 3, 7);
    const fn = tgpu['~unstable'].fn([d.mat2x2f], d.mat2x2f)((e) => {
      'kernel & js';
      return e;
    });

    const clone = fn(mat);

    expect(clone).toStrictEqual(mat);
    expect(clone).not.toBe(mat);
  });

  it('returns a deep copy of a struct', () => {
    const struct = { prop: d.vec2f(1, 2) };
    const fn = tgpu['~unstable'].fn(
      [d.struct({ prop: d.vec2f })],
      d.struct({ prop: d.vec2f }),
    )((e) => {
      'kernel & js';
      return e;
    });

    const clone = fn(struct);

    expect(clone).toStrictEqual(struct);
    expect(clone).not.toBe(struct);
    expect(clone.prop).not.toBe(struct.prop);
  });

  it('returns a deep copy of a nested struct', () => {
    const schema = d.struct({
      nested: d.struct({ prop1: d.vec2f, prop2: d.u32 }),
    });
    const struct = schema({ nested: { prop1: d.vec2f(1, 2), prop2: 21 } });
    const fn = tgpu['~unstable'].fn([schema], schema)((e) => {
      'kernel & js';
      return e;
    });

    const clone = fn(struct);

    expect(clone).toStrictEqual(struct);
    expect(clone).not.toBe(struct);
    expect(clone.nested).not.toBe(struct.nested);
  });

  // TODO: make it work
  // it('returns a deep copy of an array', () => {
  //   const array = [d.vec2f(), d.vec2f()];
  //   const fn = tgpu['~unstable'].fn(
  //     [d.arrayOf(d.vec2f, 2)],
  //     d.arrayOf(d.vec2f, 2),
  //   )(
  //     (e) => {
  //       'kernel & js';
  //       return e;
  //     },
  //   );

  //   const clone = fn(array);

  //   expect(clone).toStrictEqual(array);
  //   expect(clone).not.toBe(array);
  //   expect(clone[0]).not.toBe(array[0]);
  // });

  it('does not modify its argument', () => {
    const vec = d.vec3f();
    const fn = tgpu['~unstable'].fn([d.vec3f])(
      (e) => {
        'kernel & js';
        const copy = e; // in WGSL, this would copy the value, in JS it only copies the reference
        copy[0] = 1;
      },
    );

    fn(vec);

    expect(vec).toStrictEqual(d.vec3f());
  });
});
