import { describe, expect, expectTypeOf, it } from 'vitest';
import { tgpu, d } from 'typegpu';

describe('d.size', () => {
  it('adds @size attribute for the custom sized struct members', () => {
    const s1 = d.struct({
      a: d.u32,
      b: d.size(16, d.u32),
      c: d.u32,
    });

    expect(tgpu.resolve([s1])).toContain('@size(16) b: u32,');
  });

  it('changes size of the struct containing aligned member', () => {
    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.u32,
          c: d.u32,
        }),
      ),
    ).toBe(12);

    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.size(8, d.u32),
          c: d.u32,
        }),
      ),
    ).toBe(16);

    expect(
      d.sizeOf(
        d.struct({
          a: d.u32,
          b: d.size(8, d.u32),
          c: d.size(16, d.u32),
        }),
      ),
    ).toBe(28);

    // nested
    const NestedStruct = d.struct({
      a: d.u32,
      b: d.struct({
        c: d.size(20, d.f32),
      }),
    });
    expect(d.sizeOf(NestedStruct)).toBe(24);

    // taking alignment into account
    const AlignedStruct = d.struct({
      a: d.struct({
        c: d.size(17, d.f32),
      }),
      b: d.u32,
    });
    expect(d.sizeOf(AlignedStruct)).toBe(24);
  });

  it('does not change the size of a schema that is not a struct member', () => {
    // WGSL only applies @size to struct members, so it has no effect here
    expect(d.sizeOf(d.size(32, d.u32))).toBe(4);
    expect(d.sizeOf(d.size(32, d.vec3f))).toBe(12);
    expect(d.sizeOf(d.size(64, d.struct({ a: d.u32, b: d.vec2f })))).toBe(16);

    // the custom size still applies once the schema is used as a member
    const Struct = d.struct({ a: d.size(32, d.u32), b: d.u32 });
    expect(d.sizeOf(Struct)).toBe(36);
    expect(d.memoryLayoutOf(Struct, (s) => s.b).offset).toBe(32);
  });

  it('does not change the size of a loose schema that is not an unstruct member', () => {
    expect(d.sizeOf(d.size(32, d.unstruct({ a: d.u32 })))).toBe(4);
    expect(d.sizeOf(d.size(32, d.disarrayOf(d.u32, 2)))).toBe(8);
    expect(d.sizeOf(d.size(16, d.unorm8x4))).toBe(4);

    // the custom size still applies once the schema is used as a member
    const Unstruct = d.unstruct({ a: d.size(32, d.unstruct({ x: d.u32 })), b: d.u32 });
    expect(d.sizeOf(Unstruct)).toBe(36);
    expect(d.memoryLayoutOf(Unstruct, (s) => s.b).offset).toBe(32);
  });

  it('throws for invalid size values', () => {
    expect(() => d.size(3, d.u32)).toThrow();
    d.size(4, d.u32);

    expect(() => d.size(11, d.vec3f)).toThrow();
    d.size(12, d.vec3f);

    expect(() => d.size(-2, d.u32)).toThrow();
  });

  it('changes size of loose array element', () => {
    const s1 = d.disarrayOf(d.size(11, d.u32), 10);

    expect(d.sizeOf(s1)).toBe(110);
    expectTypeOf(s1).toEqualTypeOf<d.Disarray<d.Decorated<d.U32, [d.Size<11>]>>>();
  });

  it('changes size of loose struct member of type loose array', () => {
    const s1 = d.unstruct({
      a: d.u32, // 4
      b: d.size(20, d.disarrayOf(d.u32, 4)), // 20
      c: d.u32, // 4
    });

    expect(d.sizeOf(s1)).toBe(28);
    expectTypeOf(s1).toEqualTypeOf<
      d.Unstruct<{
        a: d.U32;
        b: d.LooseDecorated<d.Disarray<d.U32>, [d.Size<20>]>;
        c: d.U32;
      }>
    >();
  });
});
