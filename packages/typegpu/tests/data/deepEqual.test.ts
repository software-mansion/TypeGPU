import { describe, it, expect } from 'vitest';
import {
  deepEqual,
  f32,
  u32,
  i32,
  vec2f,
  vec3f,
  vec2u,
  mat2x2f,
  mat3x3f,
  struct,
  unstruct,
  arrayOf,
  disarrayOf,
  align,
  location,
  f16,
} from '../../src/data/index.ts';

describe('deepEqual', () => {
  it('compares simple types', () => {
    expect(deepEqual(f32, f32)).toBe(true);
    expect(deepEqual(u32, u32)).toBe(true);
    expect(deepEqual(f32, u32)).toBe(false);
    expect(deepEqual(f32, f16)).toBe(false);
  });

  it('compares vector types', () => {
    expect(deepEqual(vec2f, vec2f)).toBe(true);
    expect(deepEqual(vec3f, vec3f)).toBe(true);
    expect(deepEqual(vec2f, vec3f)).toBe(false);
    expect(deepEqual(vec2f, vec2u)).toBe(false);
  });

  it('compares matrix types', () => {
    expect(deepEqual(mat2x2f, mat2x2f)).toBe(true);
    expect(deepEqual(mat3x3f, mat3x3f)).toBe(true);
    expect(deepEqual(mat2x2f, mat3x3f)).toBe(false);
  });

  it('compares struct types', () => {
    const struct1 = struct({ a: f32, b: vec2u });
    const struct2 = struct({ a: f32, b: vec2u });
    const struct3 = struct({ b: vec2u, a: f32 }); // different order
    const struct4 = struct({ a: u32, b: vec2u }); // different prop type
    const struct5 = struct({ a: f32, c: vec2u }); // different prop name
    const struct6 = struct({ a: f32 }); // different number of props

    expect(deepEqual(struct1, struct2)).toBe(true);
    expect(deepEqual(struct1, struct3)).toBe(true); // property order shouldn't matter
    expect(deepEqual(struct1, struct4)).toBe(false);
    expect(deepEqual(struct1, struct5)).toBe(false);
    expect(deepEqual(struct1, struct6)).toBe(false);
  });

  it('compares nested struct types', () => {
    const nested1 = struct({ c: i32 });
    const nested2 = struct({ c: i32 });
    const nested3 = struct({ c: u32 });

    const struct1 = struct({ a: f32, b: nested1 });
    const struct2 = struct({ a: f32, b: nested2 });
    const struct3 = struct({ a: f32, b: nested3 });

    expect(deepEqual(struct1, struct2)).toBe(true);
    expect(deepEqual(struct1, struct3)).toBe(false);
  });

  it('compares array types', () => {
    const array1 = arrayOf(f32, 4);
    const array2 = arrayOf(f32, 4);
    const array3 = arrayOf(u32, 4);
    const array4 = arrayOf(f32, 5);

    expect(deepEqual(array1, array2)).toBe(true);
    expect(deepEqual(array1, array3)).toBe(false);
    expect(deepEqual(array1, array4)).toBe(false);
  });

  it('compares arrays of structs', () => {
    const struct1 = struct({ a: f32 });
    const struct2 = struct({ a: f32 });
    const struct3 = struct({ a: u32 });

    const array1 = arrayOf(struct1, 2);
    const array2 = arrayOf(struct2, 2);
    const array3 = arrayOf(struct3, 2);

    expect(deepEqual(array1, array2)).toBe(true);
    expect(deepEqual(array1, array3)).toBe(false);
  });

  it('compares decorated types', () => {
    const decorated1 = align(16, f32);
    const decorated2 = align(16, f32);
    const decorated3 = align(8, f32);
    const decorated4 = align(16, u32);
    const decorated5 = location(0, f32);

    expect(deepEqual(decorated1, decorated2)).toBe(true);
    expect(deepEqual(decorated1, decorated3)).toBe(false);
    expect(deepEqual(decorated1, decorated4)).toBe(false);
    expect(deepEqual(decorated1, decorated5)).toBe(false);
  });

  it('compares loose data types', () => {
    const unstruct1 = unstruct({ a: f32 });
    const unstruct2 = unstruct({ a: f32 });
    const unstruct3 = unstruct({ b: f32 });

    const disarray1 = disarrayOf(u32, 4);
    const disarray2 = disarrayOf(u32, 4);
    const disarray3 = disarrayOf(u32, 5);

    expect(deepEqual(unstruct1, unstruct2)).toBe(true);
    expect(deepEqual(unstruct1, unstruct3)).toBe(false);
    expect(deepEqual(disarray1, disarray2)).toBe(true);
    expect(deepEqual(disarray1, disarray3)).toBe(false);
  });

  it('compares different kinds of types', () => {
    expect(deepEqual(f32, vec2f)).toBe(false);
    expect(deepEqual(struct({ a: f32 }), unstruct({ a: f32 }))).toBe(false);
    expect(deepEqual(arrayOf(f32, 4), disarrayOf(f32, 4))).toBe(false);
    expect(deepEqual(struct({ a: f32 }), f32)).toBe(false);
  });
});
