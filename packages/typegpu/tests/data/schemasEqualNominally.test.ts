import { describe, expect, it } from 'vitest';
import { d } from 'typegpu';

describe('schemasEqualNominally', () => {
  it('compares simple types', () => {
    expect(d.schemasEqualNominally(d.f32, d.f32)).toBe(true);
    expect(d.schemasEqualNominally(d.u32, d.u32)).toBe(true);
    expect(d.schemasEqualNominally(d.f32, d.u32)).toBe(false);
    expect(d.schemasEqualNominally(d.f32, d.f16)).toBe(false);
  });

  it('compares vector types', () => {
    expect(d.schemasEqualNominally(d.vec2f, d.vec2f)).toBe(true);
    expect(d.schemasEqualNominally(d.vec3f, d.vec3f)).toBe(true);
    expect(d.schemasEqualNominally(d.vec2f, d.vec3f)).toBe(false);
    expect(d.schemasEqualNominally(d.vec2f, d.vec2u)).toBe(false);
  });

  it('compares matrix types', () => {
    expect(d.schemasEqualNominally(d.mat2x2f, d.mat2x2f)).toBe(true);
    expect(d.schemasEqualNominally(d.mat3x3f, d.mat3x3f)).toBe(true);
    expect(d.schemasEqualNominally(d.mat2x2f, d.mat3x3f)).toBe(false);
  });

  it('compares struct types by identity', () => {
    const struct1 = d.struct({ a: d.f32, b: d.vec2u });
    const struct2 = d.struct({ a: d.f32, b: d.vec2u }); // same shape, different identity
    const struct3 = d.struct({ b: d.vec2u, a: d.f32 }); // different order
    const struct4 = d.struct({ a: d.u32, b: d.vec2u }); // different prop type
    const struct5 = d.struct({ a: d.f32, c: d.vec2u }); // different prop name
    const struct6 = d.struct({ a: d.f32 }); // different number of props

    expect(d.schemasEqualNominally(struct1, struct1)).toBe(true);
    expect(d.schemasEqualNominally(struct1, struct2)).toBe(false);
    expect(d.schemasEqualNominally(struct1, struct3)).toBe(false);
    expect(d.schemasEqualNominally(struct1, struct4)).toBe(false);
    expect(d.schemasEqualNominally(struct1, struct5)).toBe(false);
    expect(d.schemasEqualNominally(struct1, struct6)).toBe(false);
  });

  it('compares a struct with the result of naming it', () => {
    const original = d.struct({ a: d.f32 });
    const named = original.$name('NamedStruct');

    expect(d.schemasEqualNominally(original, named)).toBe(true);
  });

  it('compares nested struct types by identity', () => {
    const nested1 = d.struct({ c: d.i32 });
    const nested2 = d.struct({ c: d.i32 });

    const struct1 = d.struct({ a: d.f32, b: nested1 });
    const struct2 = d.struct({ a: d.f32, b: nested1 }); // same nested struct, different identity
    const struct3 = d.struct({ a: d.f32, b: nested2 });

    expect(d.schemasEqualNominally(struct1, struct1)).toBe(true);
    expect(d.schemasEqualNominally(struct1, struct2)).toBe(false);
    expect(d.schemasEqualNominally(struct1, struct3)).toBe(false);
  });

  it('compares array types', () => {
    const array1 = d.arrayOf(d.f32, 4);
    const array2 = d.arrayOf(d.f32, 4);
    const array3 = d.arrayOf(d.u32, 4);
    const array4 = d.arrayOf(d.f32, 5);

    expect(d.schemasEqualNominally(array1, array2)).toBe(true);
    expect(d.schemasEqualNominally(array1, array3)).toBe(false);
    expect(d.schemasEqualNominally(array1, array4)).toBe(false);
  });

  it('compares arrays of structs', () => {
    const struct1 = d.struct({ a: d.f32 });
    const struct2 = d.struct({ a: d.f32 });
    const struct3 = d.struct({ a: d.u32 });

    const array1 = d.arrayOf(struct1, 2);
    const array2 = d.arrayOf(struct1, 2);
    const array3 = d.arrayOf(struct2, 2);
    const array4 = d.arrayOf(struct3, 2);

    expect(d.schemasEqualNominally(array1, array2)).toBe(true);
    expect(d.schemasEqualNominally(array1, array3)).toBe(false);
    expect(d.schemasEqualNominally(array1, array4)).toBe(false);
  });

  it('compares decorated types', () => {
    const decorated1 = d.align(16, d.f32);
    const decorated2 = d.align(16, d.f32);
    const decorated3 = d.align(8, d.f32);
    const decorated4 = d.align(16, d.u32);
    const decorated5 = d.location(0, d.f32);
    const decorated6 = d.size(8, d.align(16, d.u32));
    const decorated7 = d.align(16, d.size(8, d.u32));

    expect(d.schemasEqualNominally(decorated1, decorated2)).toBe(true);
    expect(d.schemasEqualNominally(decorated1, decorated3)).toBe(false);
    expect(d.schemasEqualNominally(decorated1, decorated4)).toBe(false);
    expect(d.schemasEqualNominally(decorated1, decorated5)).toBe(false);
    expect(d.schemasEqualNominally(decorated6, decorated7)).toBe(true); // decorator order should not matter
    expect(d.schemasEqualNominally(d.align(16, d.align(8, d.f32)), d.align(16, d.f32))).toBe(true); // outermost attribute wins
    expect(d.schemasEqualNominally(d.align(8, d.align(16, d.f32)), d.align(16, d.f32))).toBe(false);
  });

  it('compares decorated structs by identity', () => {
    const struct1 = d.struct({ a: d.f32 });
    const struct2 = d.struct({ a: d.f32 });

    expect(d.schemasEqualNominally(d.align(16, struct1), d.align(16, struct1))).toBe(true);
    expect(d.schemasEqualNominally(d.align(16, struct1), d.align(16, struct2))).toBe(false);
  });

  it('compares pointer types', () => {
    const ptr1 = d.ptrPrivate(d.f32);
    const ptr2 = d.ptrPrivate(d.f32);
    const ptr3 = d.ptrWorkgroup(d.f32);
    const ptr4 = d.ptrPrivate(d.u32);
    const ptr5 = d.ptrStorage(d.f32, 'read');
    const ptr6 = d.ptrStorage(d.f32, 'read-write');

    expect(d.schemasEqualNominally(ptr1, ptr2)).toBe(true);
    expect(d.schemasEqualNominally(ptr1, ptr3)).toBe(false);
    expect(d.schemasEqualNominally(ptr1, ptr4)).toBe(false);
    expect(d.schemasEqualNominally(ptr5, ptr6)).toBe(false);
    expect(d.schemasEqualNominally(d.ptrStorage(d.f32, 'read'), d.ptrStorage(d.f32, 'read'))).toBe(
      true,
    );
  });

  it('compares pointers to structs by identity', () => {
    const struct1 = d.struct({ a: d.f32 });
    const struct2 = d.struct({ a: d.f32 });

    expect(d.schemasEqualNominally(d.ptrPrivate(struct1), d.ptrPrivate(struct1))).toBe(true);
    expect(d.schemasEqualNominally(d.ptrPrivate(struct1), d.ptrPrivate(struct2))).toBe(false);
  });

  it('compares sampled texture types', () => {
    expect(d.schemasEqualNominally(d.texture2d(d.f32), d.texture2d(d.f32))).toBe(true);
    expect(d.schemasEqualNominally(d.texture2d(d.f32), d.texture2d(d.i32))).toBe(false);
    expect(d.schemasEqualNominally(d.texture2d(d.u32), d.texture2d(d.i32))).toBe(false);
    expect(
      d.schemasEqualNominally(d.textureMultisampled2d(d.f32), d.textureMultisampled2d(d.u32)),
    ).toBe(false);
  });

  it('compares storage texture types', () => {
    expect(
      d.schemasEqualNominally(d.textureStorage2d('rgba8unorm'), d.textureStorage2d('rgba8unorm')),
    ).toBe(true);
    expect(
      d.schemasEqualNominally(d.textureStorage2d('rgba8unorm'), d.textureStorage2d('rgba32float')),
    ).toBe(false);
    expect(
      d.schemasEqualNominally(
        d.textureStorage2d('rgba8unorm', 'read-only'),
        d.textureStorage2d('rgba8unorm', 'write-only'),
      ),
    ).toBe(false);
  });

  it('compares attribute params', () => {
    expect(d.schemasEqualNominally(d.builtin.vertexIndex, d.builtin.instanceIndex)).toBe(false);
    expect(
      d.schemasEqualNominally(
        d.interpolate('flat, first', d.u32),
        d.interpolate('flat, either', d.u32),
      ),
    ).toBe(false);
    expect(
      d.schemasEqualNominally(
        d.interpolate('flat, first', d.u32),
        d.interpolate('flat, first', d.u32),
      ),
    ).toBe(true);
  });

  it('compares atomic types', () => {
    const atomic1 = d.atomic(d.u32);
    const atomic2 = d.atomic(d.u32);
    const atomic3 = d.atomic(d.i32);

    expect(d.schemasEqualNominally(atomic1, atomic2)).toBe(true);
    expect(d.schemasEqualNominally(atomic1, atomic3)).toBe(false);
  });

  it('compares loose decorated types', () => {
    const unstruct1 = d.unstruct({ a: d.f32 });
    const unstruct2 = d.unstruct({ a: d.f32 });

    const decorated1 = d.align(16, unstruct1);
    const decorated2 = d.align(16, unstruct1);
    const decorated3 = d.align(16, unstruct2); // same shape, different identity
    const decorated4 = d.align(8, unstruct1);
    const decorated5 = d.location(0, unstruct1);

    expect(d.schemasEqualNominally(decorated1, decorated2)).toBe(true);
    expect(d.schemasEqualNominally(decorated1, decorated3)).toBe(false);
    expect(d.schemasEqualNominally(decorated1, decorated4)).toBe(false);
    expect(d.schemasEqualNominally(decorated1, decorated5)).toBe(false);
  });

  it('compares loose data types', () => {
    const unstruct1 = d.unstruct({ a: d.f32 });
    const unstruct2 = d.unstruct({ a: d.f32 });
    const unstruct3 = d.unstruct({ b: d.f32 });

    const disarray1 = d.disarrayOf(d.u32, 4);
    const disarray2 = d.disarrayOf(d.u32, 4);
    const disarray3 = d.disarrayOf(d.u32, 5);
    const disarray4 = d.disarrayOf(unstruct1, 4);
    const disarray5 = d.disarrayOf(unstruct1, 4);
    const disarray6 = d.disarrayOf(unstruct2, 4);

    expect(d.schemasEqualNominally(unstruct1, unstruct1)).toBe(true);
    expect(d.schemasEqualNominally(unstruct1, unstruct2)).toBe(false);
    expect(d.schemasEqualNominally(unstruct1, unstruct3)).toBe(false);
    expect(d.schemasEqualNominally(disarray1, disarray2)).toBe(true);
    expect(d.schemasEqualNominally(disarray1, disarray3)).toBe(false);
    expect(d.schemasEqualNominally(disarray4, disarray5)).toBe(true);
    expect(d.schemasEqualNominally(disarray4, disarray6)).toBe(false);
  });

  it('compares vertex formats', () => {
    expect(d.schemasEqualNominally(d.uint16x2, d.uint8x4)).toBe(false);
    expect(d.schemasEqualNominally(d.uint16x2, d.uint32)).toBe(false);
    expect(d.schemasEqualNominally(d.uint16x2, d.uint16x2)).toBe(true);
  });

  it('compares unstructs with vertex formats by identity', () => {
    const unstruct1 = d.unstruct({ a: d.uint16x2 });
    const unstruct2 = d.unstruct({ a: d.uint16x2 });
    const unstruct3 = d.unstruct({ a: d.uint32 });
    expect(d.schemasEqualNominally(unstruct1, unstruct1)).toBe(true);
    expect(d.schemasEqualNominally(unstruct1, unstruct2)).toBe(false);
    expect(d.schemasEqualNominally(unstruct1, unstruct3)).toBe(false);
  });

  it('compares different kinds of types', () => {
    expect(d.schemasEqualNominally(d.f32, d.vec2f)).toBe(false);
    expect(d.schemasEqualNominally(d.struct({ a: d.f32 }), d.unstruct({ a: d.f32 }))).toBe(false);
    expect(d.schemasEqualNominally(d.arrayOf(d.f32, 4), d.disarrayOf(d.f32, 4))).toBe(false);
    expect(d.schemasEqualNominally(d.struct({ a: d.f32 }), d.f32)).toBe(false);
  });
});
