import { describe, expect, it } from 'vitest';
import {
  align,
  arrayOf,
  atomic,
  schemasEqualStructurally,
  disarrayOf,
  f16,
  f32,
  i32,
  location,
  mat2x2f,
  mat3x3f,
  size,
  struct,
  u32,
  uint16x2,
  uint32,
  uint8x4,
  unstruct,
  vec2f,
  vec2u,
  vec3f,
  ptrPrivate,
  ptrStorage,
  ptrWorkgroup,
  builtin,
  interpolate,
  texture2d,
  textureMultisampled2d,
  textureStorage2d,
} from 'typegpu/data';

describe('schemasEqualStructurally', () => {
  it('compares simple types', () => {
    expect(schemasEqualStructurally(f32, f32)).toBe(true);
    expect(schemasEqualStructurally(u32, u32)).toBe(true);
    expect(schemasEqualStructurally(f32, u32)).toBe(false);
    expect(schemasEqualStructurally(f32, f16)).toBe(false);
  });

  it('compares vector types', () => {
    expect(schemasEqualStructurally(vec2f, vec2f)).toBe(true);
    expect(schemasEqualStructurally(vec3f, vec3f)).toBe(true);
    expect(schemasEqualStructurally(vec2f, vec3f)).toBe(false);
    expect(schemasEqualStructurally(vec2f, vec2u)).toBe(false);
  });

  it('compares matrix types', () => {
    expect(schemasEqualStructurally(mat2x2f, mat2x2f)).toBe(true);
    expect(schemasEqualStructurally(mat3x3f, mat3x3f)).toBe(true);
    expect(schemasEqualStructurally(mat2x2f, mat3x3f)).toBe(false);
  });

  it('compares struct types', () => {
    const struct1 = struct({ a: f32, b: vec2u });
    const struct2 = struct({ a: f32, b: vec2u });
    const struct3 = struct({ b: vec2u, a: f32 }); // different order
    const struct4 = struct({ a: u32, b: vec2u }); // different prop type
    const struct5 = struct({ a: f32, c: vec2u }); // different prop name
    const struct6 = struct({ a: f32 }); // different number of props

    expect(schemasEqualStructurally(struct1, struct2)).toBe(true);
    expect(schemasEqualStructurally(struct1, struct3)).toBe(false); // property order should matter
    expect(schemasEqualStructurally(struct1, struct4)).toBe(false);
    expect(schemasEqualStructurally(struct1, struct5)).toBe(false);
    expect(schemasEqualStructurally(struct1, struct6)).toBe(false);
  });

  it('compares nested struct types', () => {
    const nested1 = struct({ c: i32 });
    const nested2 = struct({ c: i32 });
    const nested3 = struct({ c: u32 });

    const struct1 = struct({ a: f32, b: nested1 });
    const struct2 = struct({ a: f32, b: nested2 });
    const struct3 = struct({ a: f32, b: nested3 });

    expect(schemasEqualStructurally(struct1, struct2)).toBe(true);
    expect(schemasEqualStructurally(struct1, struct3)).toBe(false);
  });

  it('compares array types', () => {
    const array1 = arrayOf(f32, 4);
    const array2 = arrayOf(f32, 4);
    const array3 = arrayOf(u32, 4);
    const array4 = arrayOf(f32, 5);

    expect(schemasEqualStructurally(array1, array2)).toBe(true);
    expect(schemasEqualStructurally(array1, array3)).toBe(false);
    expect(schemasEqualStructurally(array1, array4)).toBe(false);
  });

  it('compares arrays of structs', () => {
    const struct1 = struct({ a: f32 });
    const struct2 = struct({ a: f32 });
    const struct3 = struct({ a: u32 });

    const array1 = arrayOf(struct1, 2);
    const array2 = arrayOf(struct2, 2);
    const array3 = arrayOf(struct3, 2);

    expect(schemasEqualStructurally(array1, array2)).toBe(true);
    expect(schemasEqualStructurally(array1, array3)).toBe(false);
  });

  it('compares decorated types', () => {
    const decorated1 = align(16, f32);
    const decorated2 = align(16, f32);
    const decorated3 = align(8, f32);
    const decorated4 = align(16, u32);
    const decorated5 = location(0, f32);
    const decorated6 = size(8, align(16, u32));
    const decorated7 = align(16, size(8, u32));

    expect(schemasEqualStructurally(decorated1, decorated2)).toBe(true);
    expect(schemasEqualStructurally(decorated1, decorated3)).toBe(false);
    expect(schemasEqualStructurally(decorated1, decorated4)).toBe(false);
    expect(schemasEqualStructurally(decorated1, decorated5)).toBe(false);
    expect(schemasEqualStructurally(decorated6, decorated7)).toBe(false); // decorator order should matter
  });

  it('compares pointer types', () => {
    const ptr1 = ptrPrivate(f32);
    const ptr2 = ptrPrivate(f32);
    const ptr3 = ptrWorkgroup(f32);
    const ptr4 = ptrPrivate(u32);
    const ptr5 = ptrStorage(f32, 'read');
    const ptr6 = ptrStorage(f32, 'read-write');

    expect(schemasEqualStructurally(ptr1, ptr2)).toBe(true);
    expect(schemasEqualStructurally(ptr1, ptr3)).toBe(false);
    expect(schemasEqualStructurally(ptr1, ptr4)).toBe(false);
    expect(schemasEqualStructurally(ptr5, ptr6)).toBe(false);
    expect(schemasEqualStructurally(ptrStorage(f32, 'read'), ptrStorage(f32, 'read'))).toBe(true);
  });

  it('compares sampled texture types', () => {
    expect(schemasEqualStructurally(texture2d(f32), texture2d(f32))).toBe(true);
    expect(schemasEqualStructurally(texture2d(f32), texture2d(i32))).toBe(false);
    expect(schemasEqualStructurally(texture2d(u32), texture2d(i32))).toBe(false);
    expect(schemasEqualStructurally(textureMultisampled2d(f32), textureMultisampled2d(u32))).toBe(
      false,
    );
  });

  it('compares storage texture types', () => {
    expect(
      schemasEqualStructurally(textureStorage2d('rgba8unorm'), textureStorage2d('rgba8unorm')),
    ).toBe(true);
    expect(
      schemasEqualStructurally(textureStorage2d('rgba8unorm'), textureStorage2d('rgba32float')),
    ).toBe(false);
    expect(
      schemasEqualStructurally(
        textureStorage2d('rgba8unorm', 'read-only'),
        textureStorage2d('rgba8unorm', 'write-only'),
      ),
    ).toBe(false);
  });

  it('compares attribute params', () => {
    expect(schemasEqualStructurally(builtin.vertexIndex, builtin.instanceIndex)).toBe(false);
    expect(
      schemasEqualStructurally(interpolate('flat, first', u32), interpolate('flat, either', u32)),
    ).toBe(false);
    expect(
      schemasEqualStructurally(interpolate('flat, first', u32), interpolate('flat, first', u32)),
    ).toBe(true);
  });

  it('compares atomic types', () => {
    const atomic1 = atomic(u32);
    const atomic2 = atomic(u32);
    const atomic3 = atomic(i32);

    expect(schemasEqualStructurally(atomic1, atomic2)).toBe(true);
    expect(schemasEqualStructurally(atomic1, atomic3)).toBe(false);
  });

  it('compares loose decorated types', () => {
    const decorated1 = align(16, unstruct({ a: f32 }));
    const decorated2 = align(16, unstruct({ a: f32 }));
    const decorated3 = align(8, unstruct({ a: f32 }));
    const decorated4 = align(16, unstruct({ a: u32 }));
    const decorated5 = location(0, unstruct({ a: f32 }));

    expect(schemasEqualStructurally(decorated1, decorated2)).toBe(true);
    expect(schemasEqualStructurally(decorated1, decorated3)).toBe(false);
    expect(schemasEqualStructurally(decorated1, decorated4)).toBe(false);
    expect(schemasEqualStructurally(decorated1, decorated5)).toBe(false);
  });

  it('compares loose data types', () => {
    const unstruct1 = unstruct({ a: f32 });
    const unstruct2 = unstruct({ a: f32 });
    const unstruct3 = unstruct({ b: f32 });

    const disarray1 = disarrayOf(u32, 4);
    const disarray2 = disarrayOf(u32, 4);
    const disarray3 = disarrayOf(u32, 5);

    expect(schemasEqualStructurally(unstruct1, unstruct2)).toBe(true);
    expect(schemasEqualStructurally(unstruct1, unstruct3)).toBe(false);
    expect(schemasEqualStructurally(disarray1, disarray2)).toBe(true);
    expect(schemasEqualStructurally(disarray1, disarray3)).toBe(false);
  });

  it('compares vertex formats', () => {
    expect(schemasEqualStructurally(uint16x2, uint8x4)).toBe(false);
    expect(schemasEqualStructurally(uint16x2, uint32)).toBe(false);
    expect(schemasEqualStructurally(uint16x2, uint16x2)).toBe(true);
  });

  it('compares unstructs with vertex formats', () => {
    const unstruct1 = unstruct({ a: uint16x2 });
    const unstruct2 = unstruct({ a: uint16x2 });
    const unstruct3 = unstruct({ a: uint32 });
    expect(schemasEqualStructurally(unstruct1, unstruct2)).toBe(true);
    expect(schemasEqualStructurally(unstruct1, unstruct3)).toBe(false);
  });

  it('compares different kinds of types', () => {
    expect(schemasEqualStructurally(f32, vec2f)).toBe(false);
    expect(schemasEqualStructurally(struct({ a: f32 }), unstruct({ a: f32 }))).toBe(false);
    expect(schemasEqualStructurally(arrayOf(f32, 4), disarrayOf(f32, 4))).toBe(false);
    expect(schemasEqualStructurally(struct({ a: f32 }), f32)).toBe(false);
  });
});
