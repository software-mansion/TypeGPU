import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as d from '../../src/data/index.ts';
import * as exec from '../../src/execMode.ts';
import tgpu, { StrictNameRegistry } from '../../src/index.ts';
import { ResolutionCtxImpl } from '../../src/resolutionCtx.ts';
import { parse, parseResolved } from '../utils/parseResolved.ts';

describe('wgsl generator type inference', () => {
  let ctx: ResolutionCtxImpl;

  beforeEach(() => {
    exec.pushMode('codegen');
    ctx = new ResolutionCtxImpl({
      names: new StrictNameRegistry(),
    });
    vi.spyOn(exec, 'getResolutionCtx').mockReturnValue(ctx);
  });

  afterEach(() => {
    exec.popMode('codegen');
  });

  // it('coerces return value to u32', () => {
  //   const myFn = tgpu.fn([], d.u32)(() => {
  //     return 1.1;
  //   });

  //   expect(parseResolved({ myFn })).toBe(parse(`
  //     fn myFn() -> u32 {
  //       return u32(1.1);
  //     }
  //   `));
  // });

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

  // AAA zrób jak callable array będzie zmergowany
  // it('waits with assigning array type', () => {
  //   const Array = d.arrayOf(d.u32, 2);

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

  // it('throws when no info about what to coerce to', () => {
  //   const Boid = d.struct({ pos: d.vec2f, vel: d.vec2f });

  //   const myFn = tgpu.fn([], Boid)(() => {
  //     const unrelated = { pos: d.vec2f(), vel: d.vec2f() };
  //     return Boid({ pos: d.vec2f(), vel: d.vec2f() });
  //   });

  //   expect(() => parseResolved({ myFn })).toThrowErrorMatchingInlineSnapshot(`
  //     [Error: Resolution of the following tree failed:
  //     - <root>
  //     - fn:myFn: Object expressions are only allowed as return values of functions or as arguments to structs.]
  //   `);
  // });
});
