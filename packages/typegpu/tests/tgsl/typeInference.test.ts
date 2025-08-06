import { beforeEach, describe, expect, it } from 'vitest';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';
import { StrictNameRegistry } from '../../src/nameRegistry.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { CodegenState } from '../../src/types.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

describe('wgsl generator tgsl type inference', () => {
  let ctx: ResolutionCtxImpl;

  beforeEach(() => {
    ctx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });
    ctx.pushMode(new CodegenState());
  });

  it('coerces nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const myFn = tgpu.fn([])(() => {
      const myStruct = Outer({ inner: { prop: d.vec2f() } });
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() {
        var myStruct = Outer(Inner(vec2f()));
      }
    `));
  });

  it('coerces return value to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });
    const myFn = tgpu.fn([], Boid)(() => {
      return { vel: d.vec2f(), pos: d.vec2f(1, 1) };
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn myFn() -> Boid {
        return Boid(vec2f(1, 1), vec2f());
      }
    `));
  });

  it('coerces return value to a nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const myFn = tgpu.fn([], Outer)(() => {
      return { inner: { prop: d.vec2f() } };
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() -> Outer {
        return Outer(Inner(vec2f()));
      }
    `));
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

    expect(parseResolved({ myFn })).toBe(parse(`
      fn myFn() {
        var myArrayF32 = array<f32, 2>(1, 2);
        var myArrayF16 = array<f16, 2>(3, 4);
        var myArrayI32 = array<i32, 2>(5, 6);
        var myArrayU32 = array<u32, 2>(7, 8);
      }
    `));
  });

  it('enforces length of array literal when expecting a specific array type', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray([{ prop: d.vec2f(1, 2) }]);
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot create value of type 'arrayOf(struct:Struct, 2)' from an array of length: 1]
    `);
  });

  it('infers correct type inside of an array', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray([{ prop: d.vec2f(1, 2) }, {
        prop: d.vec2f(3, 4),
      }]);
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Struct {
        prop: vec2f,
      }
      
      fn myFn() {
        var myStructArray = array<Struct, 2>(Struct(vec2f(1, 2)), Struct(vec2f(3, 4)));
      }
    `));
  });

  it('coerces argument to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const id = tgpu.fn([Boid], Boid)((a) => a);
    const myFn = tgpu.fn([])(() => {
      const myBoid = id({ vel: d.vec2f(), pos: d.vec2f(1, 1) });
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn id(a: Boid) -> Boid {
        return a;
      }

      fn myFn() {
        var myBoid = id(Boid(vec2f(1, 1), vec2f()));
      }
    `));
  });

  it('coerces argument to an array of nested structs', () => {
    const Pos = d.struct({ x: d.u32, y: d.u32 });
    const Boid = d.struct({ pos: Pos, vel: d.vec2f });
    const BoidArray = d.arrayOf(Boid, 1);

    const nop = tgpu.fn([Pos, Boid, BoidArray])((p, b, a) => {
      return;
    });
    const myFn = tgpu.fn([])(() => {
      nop(
        { x: 1, y: 2 },
        { vel: d.vec2f(), pos: { x: 3, y: 4 } },
        [{ vel: d.vec2f(), pos: { x: 5, y: 6 } }],
      );
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Pos {
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
        nop(
          Pos(1, 2),
          Boid(Pos(3, 4), vec2f()),
          array<Boid, 1>(Boid(Pos(5, 6), vec2f()))
        );
      }
    `));
  });

  it('throws when returning a value from void function', () => {
    const add = tgpu.fn([d.u32, d.u32])(
      (x, y) => x + y,
    );

    expect(() => parseResolved({ add })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:add: Cannot convert value of type 'u32' to type 'void']
    `);
  });

  it('throws when returning an unconvertible value', () => {
    const add = tgpu.fn([], d.vec3f)(() => {
      return 1 as unknown as d.v3f;
    });

    expect(() => parseResolved({ add })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:add: Cannot convert value of type 'abstractInt' to type 'vec3f']
    `);
  });

  it('does not convert float to int', () => {
    const myFn = tgpu.fn([], d.u32)(() => {
      return 1.1;
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'abstractFloat' to type 'u32']
    `);
  });

  it('throws when no info about what to coerce to', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const myFn = tgpu.fn([], Boid)(() => {
      const unrelated = { pos: d.vec2f(), vel: d.vec2f() };
      return Boid({ pos: d.vec2f(), vel: d.vec2f() });
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: No target type could be inferred for object with keys [pos, vel], please wrap the object in the corresponding schema.]
    `);
  });

  it('throws when if condition is not boolean', () => {
    const myFn = tgpu.fn([], d.bool)(() => {
      if (d.vec2b()) {
        return true;
      }
      return false;
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'vec2<bool>' to type 'bool']
    `);
  });

  it('throws when while condition is not boolean', () => {
    const myFn = tgpu.fn([], d.bool)(() => {
      while (d.mat2x2f()) {
        return true;
      }
      return false;
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'mat2x2f' to type 'bool']
    `);
  });

  it('throws when for condition is not boolean', () => {
    const myFn = tgpu.fn([], d.bool)(() => {
      // biome-ignore lint/correctness/noConstantCondition: this is a test
      // biome-ignore lint/correctness/noUnreachable: this is a test
      for (let i = 0; 1; i < 10) {
        return true;
      }
      return false;
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot convert value of type 'abstractInt' to type 'bool']
    `);
  });

  it('throws when creating an empty untyped array', () => {
    const myFn = tgpu.fn([])(() => {
      const myArr = [];
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
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
      names: new StrictNameRegistry(),
    });
    ctx.pushMode(new CodegenState());
  });

  it('coerces nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const structValue = { inner: { prop: d.vec2f() } };
    const myFn = tgpu.fn([])(() => {
      const myStruct = Outer(structValue);
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() {
        var myStruct = Outer(Inner(vec2f(0, 0)));
      }
    `));
  });

  it('coerces return value to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const structValue = { vel: d.vec2f(), pos: d.vec2f(1, 1) };
    const myFn = tgpu.fn([], Boid)(() => {
      return structValue;
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn myFn() -> Boid {
        return Boid(vec2f(1, 1), vec2f(0, 0));
      }
    `));
  });

  it('coerces return value to a nested structs', () => {
    const Inner = d.struct({ prop: d.vec2f });
    const Outer = d.struct({ inner: Inner });

    const structValue = { inner: { prop: d.vec2f() } };
    const myFn = tgpu.fn([], Outer)(() => {
      return structValue;
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Inner {
        prop: vec2f,
      }

      struct Outer {
        inner: Inner,
      }

      fn myFn() -> Outer {
        return Outer(Inner(vec2f(0, 0)));
      }
    `));
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

    expect(parseResolved({ myFn })).toBe(parse(`
      fn myFn() {
        var myArrayF32 = array<f32, 2>(1, 2);
        var myArrayF16 = array<f16, 2>(3, 4);
        var myArrayI32 = array<i32, 2>(5, 6);
        var myArrayU32 = array<u32, 2>(7, 8);
      }
    `));
  });

  it('enforces length of array literal when expecting a specific array type', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const arrayValue = [{ prop: d.vec2f(1, 2) }];
    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray(arrayValue);
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
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

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Struct {
        prop: vec2f,
      }
      
      fn myFn() {
        var myStructArray = array<Struct, 2>(Struct(vec2f(1, 2)), Struct(vec2f(3, 4)));
      }
    `));
  });

  it('coerces argument to a struct', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const id = tgpu.fn([Boid], Boid)((a) => a);
    const structValue = { vel: d.vec2f(), pos: d.vec2f(1, 1) };
    const myFn = tgpu.fn([])(() => {
      const myBoid = id(structValue);
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Boid {
        pos: vec2f,
        vel: vec2f,
      }

      fn id(a: Boid) -> Boid {
        return a;
      }

      fn myFn() {
        var myBoid = id(Boid(vec2f(1, 1), vec2f(0, 0)));
      }
    `));
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

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Pos {
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
        nop(
          Pos(1, 2),
          Boid(Pos(3, 4), vec2f(0, 0)),
          array<Boid, 1>(Boid(Pos(5, 6), vec2f(0, 0)))
        );
      }
    `));
  });

  it('throws when no info about what to coerce to', () => {
    const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

    const structValue = { pos: d.vec2f(), vel: d.vec2f() };
    const myFn = tgpu.fn([], Boid)(() => {
      const unrelated = structValue;
      return Boid({ pos: d.vec2f(), vel: d.vec2f() });
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: No target type could be inferred for object with keys [pos, vel], please wrap the object in the corresponding schema.]
    `);
  });

  it('throws when creating an empty untyped array', () => {
    const arrayValue: unknown[] = [];
    const myFn = tgpu.fn([])(() => {
      const myArr = arrayValue;
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Cannot infer the type of an empty array literal.]
    `);
  });
});
