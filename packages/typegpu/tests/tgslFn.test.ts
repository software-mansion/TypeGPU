import { describe, expect, it } from 'vitest';
import { builtin } from '../src/builtin.ts';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { getName } from '../src/name.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('TGSL tgpu.fn function', () => {
  it('is namable', () => {
    const getX = tgpu['~unstable']
      .fn(
        [],
        d.f32,
      )(() => {
        return 3;
      })
      .$name('get_x');

    expect(getName(getX)).toBe('get_x');
  });

  it('resolves fn to WGSL', () => {
    const getY = tgpu['~unstable']
      .fn(
        [],
        d.f32,
      )(() => {
        return 3;
      })
      .$name('getY');

    const actual = parseResolved({ getY });

    const expected = parse(`
      fn getY() -> f32 {
        return 3;
      }`);

    expect(actual).toBe(expected);
  });

  it('resolves externals', () => {
    const v = d.vec3f; // necessary workaround until we finish implementation of member access in the generator
    const getColor = tgpu['~unstable']
      .fn(
        [],
        d.vec3f,
      )(() => {
        const color = v();
        const color2 = v(1, 2, 3);
        return color;
      })
      .$uses({ v: d.vec3f })
      .$name('get_color');

    const getX = tgpu['~unstable']
      .fn(
        [],
        d.f32,
      )(() => {
        const color = getColor();
        return 3;
      })
      .$name('get_x')
      .$uses({ getColor });

    const getY = tgpu['~unstable']
      .fn(
        [],
        d.f32,
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

    expect(actual).toBe(expected);
  });

  it('resolves structs', () => {
    const Gradient = d.struct({
      from: d.vec3f,
      to: d.vec3f,
    });

    const createGradient = tgpu['~unstable']
      .fn(
        [],
        Gradient,
      )(() => {
        return Gradient({ to: d.vec3f(1, 2, 3), from: d.vec3f(4, 5, 6) });
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

    expect(actual).toBe(expected);
  });

  it('resolves deeply nested structs', () => {
    const A = d
      .struct({
        b: d.f32,
      })
      .$name('A');

    const B = d
      .struct({
        a: A,
        c: d.f32,
      })
      .$name('B');

    const C = d
      .struct({
        b: B,
        a: A,
      })
      .$name('C');

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
      })
      .$name('fragment_fn');

    const actual = parseResolved({ fragmentFn });

    const expected = parse(`
      struct fragment_fn_Input {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
        @builtin(sample_mask) sampleMask: u32,
      }

      struct fragment_fn_Output {
        @builtin(sample_mask) sampleMask: u32,
        @builtin(frag_depth) fragDepth: f32,
        @location(0) out: vec4f,
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

    expect(actual).toBe(expected);
  });

  it('resolves fragmentFn with a single output', () => {
    const fragmentFn = tgpu['~unstable']
      .fragmentFn({ in: { pos: builtin.position }, out: d.vec4f })((input) => {
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

    expect(actual).toBe(expected);
  });

  it('allows for an object based on return type struct to be returned', () => {
    const TestStruct = d
      .struct({
        a: d.f32,
        b: d.f32,
        c: d.vec2f,
      })
      .$name('TestStruct');

    const fn = tgpu['~unstable']
      .fn(
        [],
        TestStruct,
      )(() => {
        return {
          a: 1,
          b: 2,
          c: d.vec2f(3, 4),
        };
      })
      .$name('test_struct');

    const actual = parseResolved({ fn });

    const expected = parse(`
      struct TestStruct {
        a: f32,
        b: f32,
        c: vec2f,
      }

      fn test_struct() -> TestStruct {
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
      })
      .$name('TestStruct');

    const fn = tgpu['~unstable']
      .fn(
        [],
        TestStruct,
      )(() => {
        return {
          a: 1,
          b: 2,
          c: d.vec2f(3, 4),
        };
      })
      .$name('test_struct');

    const fn2 = tgpu['~unstable']
      .computeFn({
        in: { gid: builtin.globalInvocationId },
        workgroupSize: [24],
      })((input) => {
        const testStruct = fn();
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

      fn test_struct() -> TestStruct {
        return TestStruct(1, 2, vec2f(3, 4));
      }

      @compute @workgroup_size(24)
      fn compute_fn(input: compute_fn_Input) {
        var testStruct = test_struct();
      }
    `);

    expect(actual).toBe(expected);
  });

  it('resolves its header based on the shell, not AST, allowing passing function accepting a subset of arguments', () => {
    const foo = tgpu['~unstable'].fn([d.u32, d.u32], d.u32)((a) => a);

    expect(parseResolved({ foo })).toBe(
      parse(`fn foo(a: u32, arg_1: u32) -> u32 {
        return a;
      }`),
    );
  });

  it('resolves its header based on the shell, not AST, allowing passing function accepting a subset of arguments (object args)', () => {
    const foo = tgpu['~unstable'].fn(
      { a: d.u32, b: d.u32 },
      d.u32,
    )(({ a }) => a);

    expect(parseResolved({ foo })).toBe(
      parse(`fn foo(a: u32, b: u32) -> u32 {
        return a;
      }`),
    );
  });

  it('resolves its header based on the shell, not AST, allowing passing function with no arguments', () => {
    const foo = tgpu['~unstable'].fn([d.u32, d.u32], d.u32)(() => 2);

    expect(parseResolved({ foo })).toBe(
      parse(`fn foo(arg_0: u32, arg_1: u32) -> u32 {
        return 2;
      }`),
    );
  });

  it('resolves its header based on the shell, not AST, allowing passing function with no arguments (object args)', () => {
    const foo = tgpu['~unstable'].fn({ a: d.u32, b: d.u32 }, d.u32)(() => 2);

    expect(parseResolved({ foo })).toBe(
      parse(`fn foo(a: u32, b: u32) -> u32 {
        return 2;
      }`),
    );
  });

  describe('(when using plugin) can be invoked on CPU only when marked with "kernel & js" directive', () => {
    it('cannot be invoked for a constant with "kernel" directive', () => {
      const addKernel = ({ x, y }: { x: number; y: number }) => {
        'kernel';
        return x + y;
      };

      const add = tgpu['~unstable'].fn({ x: d.u32, y: d.u32 })(addKernel);

      expect(() => addKernel({ x: 2, y: 3 })).toThrow(
        'The function "addKernel" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.',
      );
      expect(() => add({ x: 2, y: 3 })).toThrow(
        'The function "addKernel" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.',
      );
      expect(parseResolved({ add })).toBe(
        parse(`fn add(x: u32, y: u32){
          return (x + y);
        }`),
      );
    });

    it('can be invoked for a constant with "kernel & js" directive', () => {
      const addKernelJs = ({ x, y }: { x: number; y: number }) => {
        'kernel & js';
        return x + y;
      };

      const add = tgpu['~unstable'].fn({ x: d.u32, y: d.u32 })(addKernelJs);

      expect(addKernelJs({ x: 2, y: 3 })).toBe(5);
      expect(add({ x: 2, y: 3 })).toBe(5);
      expect(parseResolved({ add })).toBe(
        parse(`fn add(x: u32, y: u32){
          return (x + y);
        }`),
      );
    });

    it('cannot be invoked for inline function with "kernel" directive', () => {
      const add = tgpu['~unstable'].fn({ x: d.u32, y: d.u32 })(
        ({ x, y }: { x: number; y: number }) => {
          'kernel';
          return x + y;
        },
      );

      expect(() => add({ x: 2, y: 3 })).toThrow();
      expect(parseResolved({ add })).toBe(
        parse(`fn add(x: u32, y: u32){
          return (x + y);
        }`),
      );
    });

    it('cannot be invoked for inline function with no directive', () => {
      const add = tgpu['~unstable'].fn({ x: d.u32, y: d.u32 })(
        ({ x, y }: { x: number; y: number }) => x + y,
      );

      expect(() => add({ x: 2, y: 3 })).toThrow();
      expect(parseResolved({ add })).toBe(
        parse(`fn add(x: u32, y: u32){
          return (x + y);
        }`),
      );
    });

    it('can be invoked for inline function with "kernel & js" directive', () => {
      const add = tgpu['~unstable'].fn({ x: d.u32, y: d.u32 })(
        ({ x, y }: { x: number; y: number }) => {
          'kernel & js';
          return x + y;
        },
      );

      expect(add({ x: 2, y: 3 })).toBe(5);
      expect(parseResolved({ add })).toBe(
        parse(`fn add(x: u32, y: u32){
          return (x + y);
        }`),
      );
    });
  });

  it('resolves a function with a pointer parameter', () => {
    const addOnes = tgpu['~unstable'].fn([d.ptrStorage(d.vec3f, 'read-write')])(
      (ptr) => {
        ptr.x += 1;
        ptr.y += 1;
        ptr.z += 1;
      },
    );

    const actual = parseResolved({ addOnes });

    const expected = parse(`
      fn addOnes(ptr: ptr<storage, vec3f, read_write>) {
        (*ptr).x += 1;
        (*ptr).y += 1;
        (*ptr).z += 1;
      }
    `);

    expect(actual).toEqual(expected);

    const callAddOnes = tgpu['~unstable'].fn({})(() => {
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
});
