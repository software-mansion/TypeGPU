import { beforeEach, describe, expect, it } from 'vitest';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';
import { StrictNameRegistry } from '../../src/nameRegistry.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { CodegenState } from '../../src/types.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

describe('wgsl generator type inference', () => {
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
      return Outer({ inner: { prop: d.vec2f() } });
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

  it('infers correct type inside of an array', () => {
    const Struct = d.struct({ prop: d.vec2f });
    const StructArray = d.arrayOf(Struct, 2);

    const myFn = tgpu.fn([])(() => {
      const myStructArray = StructArray([{ prop: d.vec2f(1, 2) }]);
    });

    expect(parseResolved({ myFn })).toBe(parse(`
      struct Struct {
        prop: vec2f,
      }
      
      fn myFn() {
        var myStructArray = array<Struct, 1>(Struct(vec2f(1, 2)));
      }
    `));
  });

  // it('coerces referenced value to a struct', () => {
  //   const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });
  //   const boid = { vel: d.vec2f(), pos: d.vec2f(1, 1) };

  //   const myFn = tgpu.fn([])(() => {
  //     const myBoid = Boid(boid);
  //   });

  //   expect(parseResolved({ myFn })).toBe(parse(`
  //     struct Boid {
  //       pos: vec2f,
  //       vel: vec2f,
  //     }

  //     fn myFn() -> Boid {
  //       return Boid(vec2f(1, 1), vec2f());
  //     }
  //   `));
  // });

  // it('coerces argument to a struct', () => {
  //   const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

  //   const id = tgpu.fn([Boid], Boid)((a) => a);
  //   const myFn = tgpu.fn([])(() => {
  //     const myBoid = id({ vel: d.vec2f(), pos: d.vec2f(1, 1) });
  //   });

  //   expect(parseResolved({ myFn })).toBe(parse(`
  //     struct Boid {
  //       pos: vec2f,
  //       vel: vec2f,
  //     }

  //     fn id(arg_0: Boid) -> Boid {
  //       return arg_0;
  //     }

  //     fn myFn() -> Boid {
  //       const myBoid = id(Boid(vec2f(1, 1), vec2f()));
  //     }
  //   `));
  // });

  // it('coerces argument to a nested struct', () => {
  //   const Pos = d.struct({ x: d.u32, y: d.u32 });
  //   const Boid = d.struct({ pos: Pos, vel: d.vec2f });
  //   const boid = Boid({ pos: { x: 1, y: 1 }, vel: d.vec2f() });

  //   const myFn = tgpu.fn([])(() => {
  //     const myBoid = Boid(boid);
  //   });

  //   expect(parseResolved({ myFn })).toBe(parse(`
  //     struct Pos {
  //       x: u32,
  //       y: u32,
  //     }

  //     struct Boid {
  //       pos: Pos,
  //       vel: vec2f,
  //     }

  //     fn myFn() {
  //       const myBoid Boid(Pos(1, 1), vec2f()));
  //     }
  //   `));
  // });

  it('throws when returning a value from void function', () => {
    const add = tgpu.fn([d.u32, d.u32])(
      (x, y) => x + y,
    );

    expect(() => parseResolved({ add })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:add: Tried converting a value to null type.]
    `);
  });

  it('throws when returning an unconvertible value', () => {
    const add = tgpu.fn([], d.vec3f)(() => {
      return 1 as unknown as d.v3f;
    });

    expect(() => parseResolved({ add })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:add: Actual type abstractInt does match and cannot be converted to expected type vec3f.]
    `);
  });

  it('does not convert float to int', () => {
    const myFn = tgpu.fn([], d.u32)(() => {
      return 1.1;
    });

    expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn: Actual type abstractFloat does match and cannot be converted to expected type u32.]
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
      - fn:myFn: No target type could be inferred for object with keys [pos,vel], please wrap the object in the corresponding schema.]
    `);
  });
});
