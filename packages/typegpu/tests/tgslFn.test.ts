import { attest } from '@ark/attest';
import { describe, expect } from 'vitest';
import { builtin } from '../src/builtin.ts';
import tgpu, { d, type TgpuFn, type TgpuSlot } from '../src/index.js';
import { getName } from '../src/shared/meta.ts';
import { it } from './utils/extendedIt.ts';

describe('TGSL tgpu.fn function', () => {
  it('is namable', () => {
    const getX = tgpu
      .fn(
        [],
        d.f32,
      )(() => 3)
      .$name('get_x');

    expect(getName(getX)).toBe('get_x');
  });

  it('resolves to WGSL', () => {
    const getY = tgpu.fn([], d.f32)(() => 3);

    expect(tgpu.resolve([getY])).toMatchInlineSnapshot(`
      "fn getY() -> f32 {
        return 3f;
      }"
    `);
  });

  it('resolves externals', () => {
    const getColor = tgpu
      .fn(
        [],
        d.vec3f,
      )(() => {
        const color = d.vec3f();
        const color2 = d.vec3f(1, 2, 3);
        return color;
      })
      .$uses({ v: d.vec3f });

    const getX = tgpu
      .fn(
        [],
        d.f32,
      )(() => {
        const color = getColor();
        return 3;
      })
      .$uses({ getColor });

    const getY = tgpu
      .fn(
        [],
        d.f32,
      )(() => {
        const c = getColor();
        return getX();
      })
      .$uses({ getX, getColor });

    expect(tgpu.resolve([getY])).toMatchInlineSnapshot(`
      "fn getColor() -> vec3f {
        var color = vec3f();
        var color2 = vec3f(1, 2, 3);
        return color;
      }

      fn getX() -> f32 {
        var color = getColor();
        return 3f;
      }

      fn getY() -> f32 {
        var c = getColor();
        return getX();
      }"
    `);
  });

  it('resolves structs', () => {
    const Gradient = d.struct({
      start: d.vec3f,
      end: d.vec3f,
    });

    const createGradient = tgpu.fn(
      [],
      Gradient,
    )(() => {
      return Gradient({ end: d.vec3f(1, 2, 3), start: d.vec3f(4, 5, 6) });
    });

    expect(tgpu.resolve([createGradient])).toMatchInlineSnapshot(`
      "struct Gradient {
        start: vec3f,
        end: vec3f,
      }

      fn createGradient() -> Gradient {
        return Gradient(vec3f(4, 5, 6), vec3f(1, 2, 3));
      }"
    `);
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

    const pureConfusion = tgpu.fn(
      [],
      A,
    )(() => {
      return C({ a: A({ b: 3 }), b: B({ a: A({ b: 4 }), c: 5 }) }).a;
    });

    expect(tgpu.resolve([pureConfusion])).toMatchInlineSnapshot(`
      "struct A {
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
        return C(B(A(4f), 5f), A(3f)).a;
      }"
    `);
  });

  it('resolves vertexFn', () => {
    const vertexFn = tgpu
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

    expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
      "struct vertex_fn_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertex_fn_Input {
        @builtin(vertex_index) vi: u32,
        @builtin(instance_index) ii: u32,
        @location(0) color: vec4f,
      }

      @vertex fn vertex_fn(input: vertex_fn_Input) -> vertex_fn_Output {
        let vi = f32(input.vi);
        let ii = f32(input.ii);
        let color = input.color;
        return vertex_fn_Output(vec4f(color.w, ii, vi, 1f), vec2f(color.w, vi));
      }"
    `);
  });

  it('resolves vertexFn with empty in', () => {
    const vertexFn = tgpu.vertexFn({
      out: { pos: d.builtin.position },
    })(() => ({ pos: d.vec4f() }));

    expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
      "struct vertexFn_Output {
        @builtin(position) pos: vec4f,
      }

      @vertex fn vertexFn() -> vertexFn_Output {
        return vertexFn_Output(vec4f());
      }"
    `);
  });

  it('throws when vertexFn with empty out', () => {
    expect(() =>
      tgpu.vertexFn({
        in: { vi: builtin.vertexIndex },
        out: {},
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: A vertexFn output cannot be empty since it must include the 'position' builtin.]`,
    );
  });

  it('allows destructuring the input argument in vertexFn', () => {
    const vertexFn = tgpu
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

    expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
      "struct vertex_fn_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertex_fn_Input {
        @builtin(vertex_index) vi: u32,
        @builtin(instance_index) ii: u32,
        @location(0) color: vec4f,
      }

      @vertex fn vertex_fn(_arg_0: vertex_fn_Input) -> vertex_fn_Output {
        return vertex_fn_Output(vec4f(_arg_0.color.w, f32(_arg_0.ii), f32(_arg_0.vi), 1f), vec2f(_arg_0.color.w, f32(_arg_0.vi)));
      }"
    `);
  });

  it('allows access to output struct as second argument in vertexFn', () => {
    const vertexFn = tgpu
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
      })((input, Out) => {
        const myOutput = Out({
          pos: d.vec4f(d.f32(input.color.w), d.f32(input.ii), d.f32(input.vi), 1),
          uv: d.vec2f(d.f32(input.color.w), input.vi),
        });
        return myOutput;
      })
      .$name('vertex_fn');

    expect(getName(vertexFn)).toBe('vertex_fn');
    expect(tgpu.resolve([vertexFn])).toMatchInlineSnapshot(`
      "struct vertex_fn_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertex_fn_Input {
        @builtin(vertex_index) vi: u32,
        @builtin(instance_index) ii: u32,
        @location(0) color: vec4f,
      }

      @vertex fn vertex_fn(input: vertex_fn_Input) -> vertex_fn_Output {
        var myOutput = vertex_fn_Output(vec4f(input.color.w, f32(input.ii), f32(input.vi), 1f), vec2f(input.color.w, f32(input.vi)));
        return myOutput;
      }"
    `);
  });

  it('resolves computeFn', () => {
    const computeFn = tgpu
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

    expect(tgpu.resolve([computeFn])).toMatchInlineSnapshot(`
      "struct compute_fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(24) fn compute_fn(input: compute_fn_Input) {
        let index = input.gid.x;
        const iterationF = 0f;
        const sign_1 = 0;
        var change = vec4f();
      }"
    `);
  });

  it('allows destructuring the input argument in computeFn', () => {
    const computeFn = tgpu
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

    expect(tgpu.resolve([computeFn])).toMatchInlineSnapshot(`
      "struct compute_fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(24) fn compute_fn(_arg_0: compute_fn_Input) {
        let index = _arg_0.gid.x;
        const iterationF = 0f;
        const sign_1 = 0;
        var change = vec4f();
      }"
    `);
  });

  it('rejects invalid arguments for computeFn', () => {
    // @ts-expect-error
    tgpu.computeFn({ in: { vid: builtin.vertexIndex }, workgroupSize: [24] })(() => {});

    // @ts-expect-error
    tgpu.computeFn({
      in: { gid: builtin.globalInvocationId, random: d.f32 },
      workgroupSize: [24],
    })(() => {});
  });

  it('resolves fragmentFn', () => {
    const fragmentFn = tgpu.fragmentFn({
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
      let sampleMask = 0;
      if (input.sampleMask > 0 && pos.x > 0) {
        sampleMask = 1;
      }

      return {
        out: d.vec4f(0, 0, 0, 0),
        fragDepth: 1,
        sampleMask: d.u32(sampleMask),
      };
    });

    expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
      "struct fragmentFn_Output {
        @builtin(sample_mask) sampleMask: u32,
        @builtin(frag_depth) fragDepth: f32,
        @location(0) out: vec4f,
      }

      struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      @fragment fn fragmentFn(input: fragmentFn_Input) -> fragmentFn_Output {
        let pos = input.pos;
        var sampleMask = 0;
        if (((input.sampleMask > 0u) && (pos.x > 0f))) {
          sampleMask = 1i;
        }
        return fragmentFn_Output(u32(sampleMask), 1f, vec4f());
      }"
    `);
  });

  it('allows accessing the output struct as second argument in fragmentFn', () => {
    const fragmentFn = tgpu.fragmentFn({
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
    })((input, Out) => {
      const myOutput = Out({
        out: d.vec4f(0, 0, 0, 0),
        fragDepth: 1,
        sampleMask: 0,
      });
      if (input.sampleMask > 0 && input.pos.x > 0) {
        myOutput.sampleMask = 1;
      }

      return myOutput;
    });

    expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
      "struct fragmentFn_Output {
        @builtin(sample_mask) sampleMask: u32,
        @builtin(frag_depth) fragDepth: f32,
        @location(0) out: vec4f,
      }

      struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      @fragment fn fragmentFn(input: fragmentFn_Input) -> fragmentFn_Output {
        var myOutput = fragmentFn_Output(0u, 1f, vec4f());
        if (((input.sampleMask > 0u) && (input.pos.x > 0f))) {
          myOutput.sampleMask = 1u;
        }
        return myOutput;
      }"
    `);
  });

  it('allows accessing fragment output even when it is not a struct', () => {
    const fragmentFn = tgpu.fragmentFn({
      in: {
        pos: builtin.position,
        uv: d.vec2f,
        sampleMask: builtin.sampleMask,
      },
      out: d.vec4f,
    })((input, Out) => {
      const hmm = Out(1.25);
      return hmm;
    });

    expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
      "struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      @fragment fn fragmentFn(input: fragmentFn_Input) -> @location(0) vec4f {
        var hmm = vec4f(1.25);
        return hmm;
      }"
    `);
  });

  it('allows destructuring the input argument in fragmentFn', () => {
    const fragmentFn = tgpu.fragmentFn({
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
    })(({ pos: position, sampleMask }, Out) => {
      const out = Out({
        out: d.vec4f(),
        fragDepth: 1,
        sampleMask: 0,
      });
      if (sampleMask > 0 && position.x > 0) {
        out.sampleMask = 1;
      }

      return out;
    });

    expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
      "struct fragmentFn_Output {
        @builtin(sample_mask) sampleMask: u32,
        @builtin(frag_depth) fragDepth: f32,
        @location(0) out: vec4f,
      }

      struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      @fragment fn fragmentFn(_arg_0: fragmentFn_Input) -> fragmentFn_Output {
        var out = fragmentFn_Output(0u, 1f, vec4f());
        if (((_arg_0.sampleMask > 0u) && (_arg_0.pos.x > 0f))) {
          out.sampleMask = 1u;
        }
        return out;
      }"
    `);
  });

  it('resolves fragmentFn with a single output', () => {
    const fragmentFn = tgpu.fragmentFn({ in: { pos: builtin.position }, out: d.vec4f })((input) => {
      return input.pos;
    });

    expect(tgpu.resolve([fragmentFn])).toMatchInlineSnapshot(`
      "struct fragmentFn_Input {
        @builtin(position) pos: vec4f,
      }

      @fragment fn fragmentFn(input: fragmentFn_Input) -> @location(0) vec4f {
        return input.pos;
      }"
    `);
  });

  it('allows for an object based on return type struct to be returned', () => {
    const TestStruct = d.struct({
      a: d.f32,
      b: d.f32,
      c: d.vec2f,
    });

    const getTestStruct = tgpu.fn(
      [],
      TestStruct,
    )(() => {
      return {
        a: 1,
        b: 2,
        c: d.vec2f(3, 4),
      };
    });

    expect(tgpu.resolve([getTestStruct])).toMatchInlineSnapshot(`
      "struct TestStruct {
        a: f32,
        b: f32,
        c: vec2f,
      }

      fn getTestStruct() -> TestStruct {
        return TestStruct(1f, 2f, vec2f(3, 4));
      }"
    `);
  });

  it('correctly handles object based on return type struct with a function call inside another function', () => {
    const TestStruct = d.struct({
      a: d.f32,
      b: d.f32,
      c: d.vec2f,
    });

    const getTestStruct = tgpu.fn(
      [],
      TestStruct,
    )(() => {
      return {
        a: 1,
        b: 2,
        c: d.vec2f(3, 4),
      };
    });

    const fn2 = tgpu
      .computeFn({
        in: { gid: builtin.globalInvocationId },
        workgroupSize: [24],
      })((input) => {
        const testStruct = getTestStruct();
      })
      .$name('compute_fn');

    expect(tgpu.resolve([fn2])).toMatchInlineSnapshot(`
      "struct TestStruct {
        a: f32,
        b: f32,
        c: vec2f,
      }

      fn getTestStruct() -> TestStruct {
        return TestStruct(1f, 2f, vec2f(3, 4));
      }

      struct compute_fn_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(24) fn compute_fn(input: compute_fn_Input) {
        var testStruct = getTestStruct();
      }"
    `);
  });

  it('resolves its header based on the shell, not AST, allowing passing function accepting a subset of arguments', () => {
    const foo = tgpu.fn([d.u32, d.u32], d.u32)((a) => a);

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(
      `
      "fn foo(a: u32, _arg_1: u32) -> u32 {
        return a;
      }"
    `,
    );
  });

  it('resolves its header based on the shell, not AST, allowing passing function with no arguments', () => {
    const foo = tgpu.fn([d.u32, d.u32], d.u32)(() => 2);

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(
      `
      "fn foo(_arg_0: u32, _arg_1: u32) -> u32 {
        return 2u;
      }"
    `,
    );
  });

  it('resolves a function with a pointer parameter', () => {
    const addOnes = tgpu.fn([d.ptrStorage(d.vec3f, 'read-write')])((ptr) => {
      ptr.$.x += 1;
      ptr.$.y += 1;
      ptr.$.z += 1;
    });

    expect(tgpu.resolve([addOnes])).toMatchInlineSnapshot(`
      "fn addOnes(ptr: ptr<storage, vec3f, read_write>) {
        (*ptr).x += 1f;
        (*ptr).y += 1f;
        (*ptr).z += 1f;
      }"
    `);

    const callAddOnes = () => {
      'use gpu';
      const someVec = d.ref(d.vec3f(1, 2, 3));
      addOnes(someVec);
    };

    expect(tgpu.resolve([callAddOnes])).toMatchInlineSnapshot(`
      "fn addOnes(ptr: ptr<storage, vec3f, read_write>) {
        (*ptr).x += 1f;
        (*ptr).y += 1f;
        (*ptr).z += 1f;
      }

      fn callAddOnes() {
        var someVec = vec3f(1, 2, 3);
        addOnes((&someVec));
      }"
    `);
  });

  it('allows destructuring the input struct argument', () => {
    const Input = d.struct({
      value: d.i32,
    });

    const fun = tgpu.fn([Input])(({ value }) => {
      const vector = d.vec2u(value);
    });

    expect(tgpu.resolve([fun])).toMatchInlineSnapshot(`
      "struct Input {
        value: i32,
      }

      fn fun(_arg_0: Input) {
        var vector = vec2u(u32(_arg_0.value));
      }"
    `);
  });

  it('correctly coerces type of input arguments', () => {
    const Input = d.struct({
      value: d.i32,
    });

    const fun = tgpu.fn([Input])((input) => {
      const vector = d.vec2u(input.value);
    });

    expect(tgpu.resolve([fun])).toMatchInlineSnapshot(`
      "struct Input {
        value: i32,
      }

      fn fun(input: Input) {
        var vector = vec2u(u32(input.value));
      }"
    `);
  });

  it('correctly coerces type of destructured aliased input arguments', () => {
    const Input = d.struct({
      value: d.i32,
    });

    const fun = tgpu.fn([Input])(({ value: v }) => {
      const vector = d.vec2u(v);
    });

    expect(tgpu.resolve([fun])).toMatchInlineSnapshot(`
      "struct Input {
        value: i32,
      }

      fn fun(_arg_0: Input) {
        var vector = vec2u(u32(_arg_0.value));
      }"
    `);
  });

  it('allows destructuring any struct argument', () => {
    const Input = d.struct({
      value: d.i32,
    });

    const fun = tgpu.fn([Input, d.i32, Input])(({ value: v }, x, { value }) => {
      const vector = d.vec3u(v, x, value);
    });

    expect(tgpu.resolve([fun])).toMatchInlineSnapshot(`
      "struct Input {
        value: i32,
      }

      fn fun(_arg_0: Input, x: i32, _arg_2: Input) {
        var vector = vec3u(u32(_arg_0.value), u32(x), u32(_arg_2.value));
      }"
    `);
  });

  it('maintains argument names in the type', () => {
    const fun = tgpu.fn(
      [d.f32, d.f32],
      d.f32,
    )((x, y) => {
      return x + y;
    });

    attest(fun).type.toString.snap('TgpuFn<(x: F32, y: F32) => F32>');
  });

  it('falls back to args_N naming when not every argument is used in the implementation', () => {
    const fun = tgpu.fn(
      [d.f32, d.f32],
      d.f32,
    )((x) => {
      return x * 2;
    });

    attest(fun).type.toString.snap('TgpuFn<(args_0: F32, args_1: F32) => F32>');
  });
});

describe('tgpu.fn arguments', () => {
  it('casts u32', () => {
    const fn = tgpu.fn([d.u32], d.f32)((e) => e);

    const result = fn(3.14);

    expect(result).toBe(3);
  });

  it('returns a copy of a float vector', () => {
    const vec = d.vec3f(1, 2, 3);
    const fn = tgpu.fn([d.vec3f], d.vec3f)((e) => e);

    const clone = fn(vec);

    expect(clone).toStrictEqual(vec);
    expect(clone).not.toBe(vec);
  });

  it('returns a copy of a bool vector', () => {
    const vec = d.vec4b(false, true, false, true);
    const fn = tgpu.fn([d.vec4b], d.vec4b)((e) => e);

    const clone = fn(vec);

    expect(clone).toStrictEqual(vec);
    expect(clone).not.toBe(vec);
  });

  it('returns a copy of a matrix', () => {
    const mat = d.mat2x2f(1, 2, 3, 7);
    const fn = tgpu.fn([d.mat2x2f], d.mat2x2f)((e) => e);

    const clone = fn(mat);

    expect(clone).toStrictEqual(mat);
    expect(clone).not.toBe(mat);
  });

  it('returns a deep copy of a struct', () => {
    const struct = { prop: d.vec2f(1, 2) };
    const fn = tgpu.fn([d.struct({ prop: d.vec2f })], d.struct({ prop: d.vec2f }))((e) => e);

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
    const fn = tgpu.fn([schema], schema)((e) => e);

    const clone = fn(struct);

    expect(clone).toStrictEqual(struct);
    expect(clone).not.toBe(struct);
    expect(clone.nested).not.toBe(struct.nested);
  });

  // TODO: make it work
  // it('returns a deep copy of an array', () => {
  //   const array = [d.vec2f(), d.vec2f()];
  //   const fn = tgpu.fn(
  //     [d.arrayOf(d.vec2f, 2)],
  //     d.arrayOf(d.vec2f, 2),
  //   )((e) => e);

  //   const clone = fn(array);

  //   expect(clone).toStrictEqual(array);
  //   expect(clone).not.toBe(array);
  //   expect(clone[0]).not.toBe(array[0]);
  // });

  it('does not modify its argument', () => {
    const vec = d.vec3f();
    const fn = tgpu.fn([d.vec3f])((e) => {
      const copy = e; // in WGSL, this would copy the value, in JS it only copies the reference
      copy[0] = 1;
    });

    fn(vec);

    expect(vec).toStrictEqual(d.vec3f());
  });
});

describe('tgpu.fn called top-level', () => {
  it('works when void of GPU resource access', () => {
    const fn = tgpu.fn([], d.f32)(() => 3);

    expect(fn()).toBe(3);
  });

  it('throws helpful error when reading a uniform', ({ root }) => {
    const uniform = root.createUniform(d.f32, 0);
    const foo = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return uniform.$; // accessing GPU resource
    });

    expect(() => foo()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:foo: Cannot access buffer:uniform. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation]
    `);
  });
});

describe('tgsl fn when using plugin', () => {
  it('can be invoked for a constant with "use gpu" directive', () => {
    const addShellless = (x: number, y: number) => {
      'use gpu';
      return x + y;
    };

    const add = tgpu.fn([d.u32, d.u32], d.u32)(addShellless);

    expect(addShellless(2, 3)).toBe(5);
    expect(add(2, 3)).toBe(5);
    expect(tgpu.resolve([add])).toMatchInlineSnapshot(`
      "fn addShellless(x: u32, y: u32) -> u32 {
        return (x + y);
      }"
    `);
  });

  it('can be invoked for inline function with no directive', () => {
    const add = tgpu.fn([d.u32, d.u32], d.u32)((x, y) => x + y);

    expect(add(2, 3)).toBe(5);
    expect(tgpu.resolve([add])).toMatchInlineSnapshot(`
      "fn add(x: u32, y: u32) -> u32 {
        return (x + y);
      }"
    `);
  });

  it('can reference function defined below', () => {
    const bar = tgpu.fn([], d.f32)(() => foo() + 2);
    const foo = tgpu.fn([], d.f32)(() => 1);

    expect(tgpu.resolve([bar])).toMatchInlineSnapshot(`
      "fn foo() -> f32 {
        return 1f;
      }

      fn bar() -> f32 {
        return (foo() + 2f);
      }"
    `);
  });

  it('throws when it detects a cyclic dependency (recursion)', () => {
    let bar: TgpuFn;
    let foo: TgpuFn;
    bar = tgpu.fn([], d.f32)(() => foo() + 2);
    foo = tgpu.fn([], d.f32)(() => bar() - 2);

    expect(() => tgpu.resolve([bar])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:bar
      - fn:foo
      - fn:bar: Recursive function fn:bar detected. Recursion is not allowed on the GPU.]
    `);
  });

  it('throws when it detects a cyclic dependency (when using slots)', () => {
    let one: TgpuFn;
    let fnSlot: TgpuSlot<TgpuFn<() => d.F32>>;
    let three: TgpuFn;
    let two: TgpuFn;
    one = tgpu.fn([], d.f32)(() => two() + 2);
    fnSlot = tgpu.slot(
      tgpu
        .fn(
          [],
          d.f32,
        )(() => one() + 2)
        .$name('inner'),
    );
    three = tgpu.fn([], d.f32)(() => fnSlot.$() + 1);
    two = tgpu.fn([], d.f32)(() => three() + 2);
    expect(() => tgpu.resolve([one])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:one
      - fn:two
      - fn:three
      - fn:inner
      - fn:one: Recursive function fn:one detected. Recursion is not allowed on the GPU.]
    `);
  });

  it('throws when it detects a cyclic dependency (when using lazy)', () => {
    let one: TgpuFn;

    const flagSlot = tgpu.slot(false);
    const fnSlot = tgpu.slot<TgpuFn<() => d.F32>>();
    const mainFn = tgpu.fn([], d.f32)(() => 1000);
    const fallbackFn = tgpu.fn([], d.f32)(() => one());

    const lazyFn = tgpu
      .lazy(() => {
        if (flagSlot.$) {
          return fnSlot.$;
        }
        return fallbackFn;
      })
      .with(fnSlot, mainFn);

    one = tgpu.fn([], d.f32)(() => lazyFn.$() + 2);

    expect(() => tgpu.resolve([one])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:one
      - fn:fallbackFn
      - fn:one: Recursive function fn:one detected. Recursion is not allowed on the GPU.]
    `);

    const boundOne = one.with(flagSlot, true);

    expect(tgpu.resolve([boundOne])).toMatchInlineSnapshot(`
      "fn mainFn() -> f32 {
        return 1000f;
      }

      fn one() -> f32 {
        return (mainFn() + 2f);
      }"
    `);
  });

  it('allows .with to be called at comptime', () => {
    const multiplierSlot = tgpu.slot(1);
    const scale = tgpu.fn(
      [d.f32],
      d.f32,
    )((v) => {
      'use gpu';
      return v * multiplierSlot.$;
    });

    const main = () => {
      'use gpu';
      scale(2);
      scale.with(multiplierSlot, 2)(2);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn scale(v: f32) -> f32 {
        return (v * 1f);
      }

      fn scale_1(v: f32) -> f32 {
        return (v * 2f);
      }

      fn main() {
        scale(2f);
        scale_1(2f);
      }"
    `);
  });

  it('throws a readable error when assigning to a value defined outside of tgsl', () => {
    let a = 0;
    const f = tgpu.fn([])(() => {
      a = 2;
    });

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:f: '0 = 2' is invalid, because 0 is a constant. This error may also occur when assigning to a value defined outside of a TypeGPU function's scope.]
    `);
  });
});
