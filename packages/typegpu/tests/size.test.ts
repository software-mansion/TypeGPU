import { describe, expect, expectTypeOf, it } from 'vitest';
import * as d from '../src/data';
import { StrictNameRegistry } from '../src/experimental';
import { resolve } from '../src/resolutionCtx';

describe('d.size', () => {
  it('adds @size attribute for the custom sized struct members', () => {
    const s1 = d
      .struct({
        a: d.u32,
        b: d.size(16, d.u32),
        c: d.u32,
      })
      .$name('s1');

    const opts = {
      names: new StrictNameRegistry(),
    };

    expect(resolve(s1, opts).code).toContain('@size(16) b: u32,');
  });

  it('changes size of the struct containing aligned member', () => {
    expect(
      d.struct({
        a: d.u32,
        b: d.u32,
        c: d.u32,
      }).size,
    ).toEqual(12);

    expect(
      d.struct({
        a: d.u32,
        b: d.size(8, d.u32),
        c: d.u32,
      }).size,
    ).toEqual(16);

    expect(
      d.struct({
        a: d.u32,
        b: d.size(8, d.u32),
        c: d.size(16, d.u32),
      }).size,
    ).toEqual(28);

    // nested
    expect(
      d.struct({
        a: d.u32,
        b: d.struct({
          c: d.size(20, d.f32),
        }),
      }).size,
    ).toEqual(24);

    // taking alignment into account
    expect(
      d.struct({
        a: d.struct({
          c: d.size(17, d.f32),
        }),
        b: d.u32,
      }).size,
    ).toEqual(24);
  });

  it('throws for invalid size values', () => {
    expect(() => d.size(3, d.u32)).toThrow();
    d.size(4, d.u32);

    expect(() => d.size(11, d.vec3f)).toThrow();
    d.size(12, d.vec3f);

    expect(() => d.size(-2, d.u32)).toThrow();
  });

  it('changes size of loose array element', () => {
    const s1 = d.looseArrayOf(d.size(11, d.u32), 10);

    expect(s1.size).toEqual(110);
    expectTypeOf(s1).toEqualTypeOf<
      d.TgpuLooseArray<d.Decorated<d.U32, [d.Size<11>]>>
    >();
  });

  it('changes size of loose struct member of type loose array', () => {
    const s1 = d.looseStruct({
      a: d.u32, // 4
      b: d.size(20, d.looseArrayOf(d.u32, 4)), // 20
      c: d.u32, // 4
    });

    expect(s1.size).toEqual(28);
    expectTypeOf(s1).toEqualTypeOf<
      d.TgpuLooseStruct<{
        a: d.U32;
        b: d.LooseDecorated<d.TgpuLooseArray<d.U32>, [d.Size<20>]>;
        c: d.U32;
      }>
    >();
  });
});
