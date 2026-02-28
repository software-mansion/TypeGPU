import { beforeEach, describe, expect, it, vi } from 'vitest';
import tgpu, { d, std } from '../../src/index.js';
import { namespace } from '../../src/core/resolve/namespace.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { CodegenState } from '../../src/types.ts';
import wgslGenerator from '../../src/tgsl/wgslGenerator.ts';

describe('wgsl generator type inference', () => {
  let ctx: ResolutionCtxImpl;

  beforeEach(() => {
    ctx = new ResolutionCtxImpl({
      namespace: namespace({ names: 'strict' }),
      shaderGenerator: wgslGenerator,
    });
    ctx.pushMode(new CodegenState());
  });

  it('coerces nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const myFn = tgpu.fn([])(() => {
      const myStruct = Outer({ inner: { prop: d.vec2f() } });
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() {
        var myStruct = Outer(Inner(vec2f()));
      }"
    `);
  });

  it('coerces return value to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });
    const myFn = tgpu.fn(
      [],
      Boid,
    )(() => {
      return { vel: d.vec2f(), pos: d.vec2f(1, 1) };
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn myFn() -> Boid {
        return Boid(vec2f(1), vec2f());
      }"
    `);
  });

  it('coerces return value to a nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const myFn = tgpu.fn(
      [],
      Outer,
    )(() => {
      return { inner: { prop: d.vec2f() } };
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() -> Outer {
        return Outer(Inner(vec2f()));
      }"
    `);
  });

  it('infers correct numeric array type', () => {
    const ArrayF32 = d.arrayOf(d.f32, 2);
    const ArrayF16 = d.arrayOf(d.f16, 2);
    const ArrayI32 = d.arrayOf(d.i32, 2);
    const ArrayU32 = d.arrayOf(d.u32, 2);

    const myFn = tgpu.fn([])(() => {
      const myArrayF32 = ArrayF32([1, 2]);
      const myArrayF16 = ArrayF16([3, 4]);
      const myArrayI32 = ArrayI32([5, 6]);
      const myArrayU32 = ArrayU32([7, 8]);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        var myArrayF32 = array<f32, 2>(1f, 2f);
        var myArrayF16 = array<f16, 2>(3h, 4h);
        var myArrayI32 = array<i32, 2>(5i, 6i);
        var myArrayU32 = array<u32, 2>(7u, 8u);
      }"
    `);
  });

  it('enforces length of array literal when expecting a specific array type', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray([{ prop: d.vec2f(1, 2) }]);
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot create value of type 'arrayOf(struct:Struct, 2)' from an array of length: 1]
    `);
  });

  it('infers correct type inside of an array', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray([
        { prop: d.vec2f(1, 2) },
        {
          prop: d.vec2f(3, 4),
        },
      ]);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Struct {
        prop: vec2f,
      }

      fn myFn() {
        var myStructArray = array<Struct, 2>(Struct(vec2f(1, 2)), Struct(vec2f(3, 4)));
      }"
    `);
  });

  it('coerces argument to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const id = tgpu.fn([Boid], Boid)((a) => Boid(a));
    const myFn = tgpu.fn([])(() => {
      const myBoid = id({ vel: d.vec2f(), pos: d.vec2f(1, 1) });
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn id(a: Boid) -> Boid {
        return a;
      }

      fn myFn() {
        var myBoid = id(Boid(vec2f(1), vec2f()));
      }"
    `);
  });

  it('coerces argument to an array of nested structs', () => {
    const Pos = d.struct({ x: d.u32, y: d.u32 });
    const Boid = d.struct({ pos: Pos, vel: d.vec2f });
    const BoidArray = d.arrayOf(Boid, 1);

    const nop = tgpu.fn([Pos, Boid, BoidArray])((p, b, a) => {
      return;
    });
    const myFn = tgpu.fn([])(() => {
      nop({ x: 1, y: 2 }, { vel: d.vec2f(), pos: { x: 3, y: 4 } }, [
        { vel: d.vec2f(), pos: { x: 5, y: 6 } },
      ]);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Pos {
        x: u32,
        y: u32,
      }

      struct Boid {
        pos: Pos,
        vel: vec2f,
      }

      fn nop(p: Pos, b: Boid, a: array<Boid, 1>) {
        return;
      }

      fn myFn() {
        nop(Pos(1u, 2u), Boid(Pos(3u, 4u), vec2f()), array<Boid, 1>(Boid(Pos(5u, 6u), vec2f())));
      }"
    `);
  });

  it('throws when returning a value from void function', () => {
    const add = tgpu.fn([d.u32, d.u32])((x, y) => x + y);

    expect(() => tgpu.resolve([add])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:add: Cannot convert value of type 'u32' to any of the target types: [void]]
    `);
  });

  it('throws when returning an unconvertible value', () => {
    const add = tgpu.fn(
      [],
      d.vec3f,
    )(() => {
      return 1 as unknown as d.v3f;
    });

    expect(() => tgpu.resolve([add])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:add: Cannot convert value of type 'abstractInt' to any of the target types: [vec3f]]
    `);
  });

  it('converts float to int implicitly with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const myFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return 1.1;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> u32 {
        return 1u;
      }"
    `);

    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      'Implicit conversions from [\n  1.1: abstractFloat\n] to u32 are supported, but not recommended.\nConsider using explicit conversions instead.',
    );
  });

  it('throws when no info about what to coerce to', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const myFn = tgpu.fn(
      [],
      Boid,
    )(() => {
      const unrelated = { pos: d.vec2f(), vel: d.vec2f() };
      return Boid({ pos: d.vec2f(), vel: d.vec2f() });
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: No target type could be inferred for object with keys [pos, vel], please wrap the object in the corresponding schema.]
    `);
  });

  it('throws when if condition is not boolean', () => {
    const myFn = tgpu.fn(
      [],
      d.bool,
    )(() => {
      if (d.vec2b()) {
        return true;
      }
      return false;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'vec2<bool>' to any of the target types: [bool]]
    `);
  });

  it('throws when while condition is not boolean', () => {
    const myFn = tgpu.fn(
      [],
      d.bool,
    )(() => {
      while (d.mat2x2f()) {
        return true;
      }
      return false;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'mat2x2f' to any of the target types: [bool]]
    `);
  });

  it('throws when for condition is not boolean', () => {
    const myFn = tgpu.fn(
      [],
      d.bool,
    )(() => {
      for (let i = 0; 1; i < 10) {
        return true;
      }
      return false;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'abstractInt' to any of the target types: [bool]]
    `);
  });

  it('throws when creating an empty untyped array', () => {
    const myFn = tgpu.fn([])(() => {
      const myArr = [];
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot infer the type of an empty array literal.]
    `);
  });
});

describe('wgsl generator js type inference', () => {
  let ctx: ResolutionCtxImpl;

  beforeEach(() => {
    ctx = new ResolutionCtxImpl({
      namespace: namespace({ names: 'strict' }),
      shaderGenerator: wgslGenerator,
    });
    ctx.pushMode(new CodegenState());
  });

  it('coerces external to be an array', () => {
    const arr = [1, 2, 3];
    const Result = d.arrayOf(d.f32, 3);

    const foo = tgpu.fn([])(() => {
      const result = Result(arr);
    });

    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() {
        var result = array<f32, 3>(1f, 2f, 3f);
      }"
    `);
  });

  it('coerces structs', () => {
    const MyStruct = d.struct({ v: d.vec2f });
    const myFn = tgpu.fn([MyStruct])(() => {
      return;
    });

    const structValue = { v: d.vec2f(3, 4) };
    const testFn = tgpu.fn([])(() => {
      myFn(MyStruct({ v: d.vec2f(1, 2) }));
      myFn(structValue);
    });

    expect(tgpu.resolve([testFn])).toMatchInlineSnapshot(`
      "struct MyStruct {
        v: vec2f,
      }

      fn myFn(_arg_0: MyStruct) {
        return;
      }

      fn testFn() {
        myFn(MyStruct(vec2f(1, 2)));
        myFn(MyStruct(vec2f(3, 4)));
      }"
    `);
  });

  it('coerces nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const structValue = { inner: { prop: d.vec2f() } };
    const myFn = tgpu.fn([])(() => {
      const myStruct = Outer(structValue);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() {
        var myStruct = Outer(Inner(vec2f()));
      }"
    `);
  });

  it('coerces return value to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const structValue = { vel: d.vec2f(), pos: d.vec2f(1, 1) };
    const myFn = tgpu.fn(
      [],
      Boid,
    )(() => {
      return structValue;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn myFn() -> Boid {
        return Boid(vec2f(1), vec2f());
      }"
    `);
  });

  it('coerces return value to a nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const structValue = { inner: { prop: d.vec2f() } };
    const myFn = tgpu.fn(
      [],
      Outer,
    )(() => {
      return structValue;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() -> Outer {
        return Outer(Inner(vec2f()));
      }"
    `);
  });

  it('infers correct numeric array type', () => {
    const ArrayF32 = d.arrayOf(d.f32, 2);
    const ArrayF16 = d.arrayOf(d.f16, 2);
    const ArrayI32 = d.arrayOf(d.i32, 2);
    const ArrayU32 = d.arrayOf(d.u32, 2);

    const arrayValueF32 = [1, 2];
    const arrayValueF16 = [3, 4];
    const arrayValueI32 = [5, 6];
    const arrayValueU32 = [7, 8];
    const myFn = tgpu.fn([])(() => {
      const myArrayF32 = ArrayF32(arrayValueF32);
      const myArrayF16 = ArrayF16(arrayValueF16);
      const myArrayI32 = ArrayI32(arrayValueI32);
      const myArrayU32 = ArrayU32(arrayValueU32);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        var myArrayF32 = array<f32, 2>(1f, 2f);
        var myArrayF16 = array<f16, 2>(3h, 4h);
        var myArrayI32 = array<i32, 2>(5i, 6i);
        var myArrayU32 = array<u32, 2>(7u, 8u);
      }"
    `);
  });

  it('enforces length of array literal when expecting a specific array type', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const arrayValue = [{ prop: d.vec2f(1, 2) }];
    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray(arrayValue);
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot create value of type 'arrayOf(struct:Struct, 2)' from an array of length: 1]
    `);
  });

  it('infers correct type inside of an array', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const arrayValue = [{ prop: d.vec2f(1, 2) }, { prop: d.vec2f(3, 4) }];
    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray(arrayValue);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Struct {
        prop: vec2f,
      }

      fn myFn() {
        var myStructArray = array<Struct, 2>(Struct(vec2f(1, 2)), Struct(vec2f(3, 4)));
      }"
    `);
  });

  it('coerces argument to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const id = tgpu.fn([Boid], Boid)((a) => Boid(a));
    const structValue = { vel: d.vec2f(), pos: d.vec2f(1, 1) };
    const myFn = tgpu.fn([])(() => {
      const myBoid = id(structValue);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn id(a: Boid) -> Boid {
        return a;
      }

      fn myFn() {
        var myBoid = id(Boid(vec2f(1), vec2f()));
      }"
    `);
  });

  it('coerces argument to an array of nested structs', () => {
    const Pos = d.struct({ x: d.u32, y: d.u32 });
    const Boid = d.struct({ pos: Pos, vel: d.vec2f });
    const BoidArray = d.arrayOf(Boid, 1);

    const nop = tgpu.fn([Pos, Boid, BoidArray])((p, b, a) => {
      return;
    });
    const structValue = { x: 1, y: 2 };
    const nestedStructValue = { vel: d.vec2f(), pos: { x: 3, y: 4 } };
    const arrayValue = [{ vel: d.vec2f(), pos: { x: 5, y: 6 } }];
    const myFn = tgpu.fn([])(() => {
      nop(structValue, nestedStructValue, arrayValue);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "struct Pos {
        x: u32,
        y: u32,
      }

      struct Boid {
        pos: Pos,
        vel: vec2f,
      }

      fn nop(p: Pos, b: Boid, a: array<Boid, 1>) {
        return;
      }

      fn myFn() {
        nop(Pos(1u, 2u), Boid(Pos(3u, 4u), vec2f()), array<Boid, 1>(Boid(Pos(5u, 6u), vec2f())));
      }"
    `);
  });

  it('throws when no info about what to coerce to', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const structValue = { pos: d.vec2f(), vel: d.vec2f() };
    const myFn = tgpu.fn(
      [],
      Boid,
    )(() => {
      const unrelated = structValue;
      return Boid({ pos: d.vec2f(), vel: d.vec2f() });
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Tried to define variable 'unrelated' of unknown type]
    `);
  });

  it('throws when creating an empty untyped array', () => {
    const arrayValue: unknown[] = [];
    const myFn = tgpu.fn([])(() => {
      const myArr = arrayValue;
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Tried to define variable 'myArr' of unknown type]
    `);
  });

  it('is generic over number of arguments', () => {
    const f32Array = d.arrayOf(d.f32);

    const interpolate = (progress: number, from: number[], to: number[]) => {
      'use gpu';
      const result = f32Array(from.length)();
      for (let i = 0; i < from.length; i++) {
        result[i] = std.mix(from[i]!, to[i]!, progress);
      }
      return result;
    };

    const main = () => {
      'use gpu';
      const foo = interpolate(0.1, [0, 0.5, 1], [100, 200, 100]);
      const bar = interpolate(0.6, [0, 0.5], [100, 40.5]);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn interpolate(progress: f32, from_1: array<f32, 3>, to: array<i32, 3>) -> array<f32, 3> {
        var result = array<f32, 3>();
        for (var i = 0; (i < 3i); i++) {
          result[i] = mix(from_1[i], f32(to[i]), progress);
        }
        return result;
      }

      fn interpolate_1(progress: f32, from_1: array<f32, 2>, to: array<f32, 2>) -> array<f32, 2> {
        var result = array<f32, 2>();
        for (var i = 0; (i < 2i); i++) {
          result[i] = mix(from_1[i], to[i], progress);
        }
        return result;
      }

      fn main() {
        var foo = interpolate(0.1f, array<f32, 3>(0., 0.5, 1.), array<i32, 3>(100, 200, 100));
        var bar = interpolate_1(0.6f, array<f32, 2>(0., 0.5), array<f32, 2>(100., 40.5));
      }"
    `);
  });
});
