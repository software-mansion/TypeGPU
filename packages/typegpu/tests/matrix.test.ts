import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, expectTypeOf, it } from 'vitest';
import tgpu, { d } from '../src/index.js';

import { readData, writeData } from '../src/data/dataIO.ts';
import { isCloseTo } from '../src/std/index.ts';

describe('mat2x2f', () => {
  it('creates a 2x2 matrix with zeros', () => {
    const zero2x2 = d.mat2x2f();
    expect(zero2x2.columns[0]).toStrictEqual(d.vec2f());
    expect(zero2x2.columns[1]).toStrictEqual(d.vec2f());
  });

  it('creates a 2x2 matrix with given elements', () => {
    const mat = d.mat2x2f(0, 1, 2, 3);
    expect(mat.columns[0]).toStrictEqual(d.vec2f(0, 1));
    expect(mat.columns[1]).toStrictEqual(d.vec2f(2, 3));
  });

  it('creates a 2x2 matrix with given column vectors', () => {
    const v0 = d.vec2f(0, 1);
    const v1 = d.vec2f(1, 2);
    const mat = d.mat2x2f(v0, v1);
    expect(mat.columns[0]).toStrictEqual(v0);
    expect(mat.columns[1]).toStrictEqual(v1);
  });

  it('encodes identity matrix properly', () => {
    const identity = d.mat2x2f(
      d.vec2f(1, 0), // column 0
      d.vec2f(0, 1), // column 1
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat2x2f));

    writeData(new BufferWriter(buffer), d.mat2x2f, identity);
    expect(readData(new BufferReader(buffer), d.mat2x2f)).toStrictEqual(
      identity,
    );
  });

  it('encodes a matrix properly', () => {
    const mat = d.mat2x2f(
      d.vec2f(0, 1), // column 0
      d.vec2f(2, 3), // column 1
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat2x2f));

    writeData(new BufferWriter(buffer), d.mat2x2f, mat);
    expect(readData(new BufferReader(buffer), d.mat2x2f)).toStrictEqual(mat);
  });

  it('can be indexed into', () => {
    const mat = d.mat2x2f(
      d.vec2f(0, 1), // column 0
      d.vec2f(2, 3), // column 1
    );

    expect(d.matToArray(mat)).toStrictEqual([0, 1, 2, 3]);
    expect(mat).toHaveLength(4);
    expect(mat[0]).toBe(0);
    expect(mat[1]).toBe(1);
    expect(mat[2]).toBe(2);
    expect(mat[3]).toBe(3);
  });

  it('is mutable through indexing', () => {
    const mat = d.mat2x2f(
      d.vec2f(0, 1), // column 0
      d.vec2f(2, 3), // column 1
    );

    mat[0] = 4;
    mat[1] = 5;
    mat[2] = 6;
    mat[3] = 7;

    expect(mat.columns[0]).toStrictEqual(d.vec2f(4, 5));
    expect(mat.columns[1]).toStrictEqual(d.vec2f(6, 7));
    expect(d.matToArray(mat)).toStrictEqual([4, 5, 6, 7]);
  });

  it('creates a matrix that resolves properly', () => {
    const mat = d.mat2x2f(
      d.vec2f(0, 1), // column 0
      d.vec2f(2, 3), // column 1
    );

    expect(tgpu.resolve({ template: 'mat', externals: { mat } })).toContain(
      'mat2x2f(0, 1, 2, 3)',
    );
  });

  it('should work with for...of', () => {
    const mat = d.mat2x2f(1, 2, 3, 4);
    let i = 0;
    for (const x of mat) {
      expect(x).toBe(mat[i]);
      expect(x).toBeDefined();
      i++;
    }
    expect(i).toBe(4);
  });
});

describe('mat3x3f', () => {
  it('creates a 3x3 matrix with zeros', () => {
    const zero3x3 = d.mat3x3f();
    expect(zero3x3.columns[0]).toStrictEqual(d.vec3f());
    expect(zero3x3.columns[1]).toStrictEqual(d.vec3f());
    expect(zero3x3.columns[2]).toStrictEqual(d.vec3f());
  });

  it('creates a 3x3 matrix with given elements', () => {
    const mat = d.mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(mat.columns[0]).toStrictEqual(d.vec3f(0, 1, 2));
    expect(mat.columns[1]).toStrictEqual(d.vec3f(3, 4, 5));
    expect(mat.columns[2]).toStrictEqual(d.vec3f(6, 7, 8));
  });

  it('creates a 3x3 matrix with given column vectors', () => {
    const v0 = d.vec3f(0, 1, 2);
    const v1 = d.vec3f(3, 4, 5);
    const v2 = d.vec3f(6, 7, 8);
    const mat = d.mat3x3f(v0, v1, v2);
    expect(mat.columns[0]).toStrictEqual(v0);
    expect(mat.columns[1]).toStrictEqual(v1);
    expect(mat.columns[2]).toStrictEqual(v2);
  });

  it('encodes identity matrix properly', () => {
    const identity = d.mat3x3f(
      d.vec3f(1, 0, 0), // column 0
      d.vec3f(0, 1, 0), // column 1
      d.vec3f(0, 0, 1), // column 2
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat3x3f));

    writeData(new BufferWriter(buffer), d.mat3x3f, identity);
    expect(readData(new BufferReader(buffer), d.mat3x3f)).toStrictEqual(
      identity,
    );
  });

  it('encodes a matrix properly', () => {
    const mat = d.mat3x3f(
      d.vec3f(0, 1, 2), // column 0
      d.vec3f(3, 4, 5), // column 1
      d.vec3f(6, 7, 8), // column 2
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat3x3f));

    writeData(new BufferWriter(buffer), d.mat3x3f, mat);
    expect(readData(new BufferReader(buffer), d.mat3x3f)).toStrictEqual(mat);
  });

  it('can be indexed into', () => {
    const mat = d.mat3x3f(
      d.vec3f(0, 1, 2), // column 0
      d.vec3f(3, 4, 5), // column 1
      d.vec3f(6, 7, 8), // column 2
    );

    expect(d.matToArray(mat)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mat).toHaveLength(12);
    expect(mat[0]).toBe(0);
    expect(mat[1]).toBe(1);
    expect(mat[2]).toBe(2);
    expect(mat[3]).toBe(0);
    expect(mat[4]).toBe(3);
    expect(mat[5]).toBe(4);
    expect(mat[6]).toBe(5);
    expect(mat[7]).toBe(0);
    expect(mat[8]).toBe(6);
    expect(mat[9]).toBe(7);
    expect(mat[10]).toBe(8);
  });

  it('is mutable through indexing', () => {
    const mat = d.mat3x3f(
      d.vec3f(0, 1, 2), // column 0
      d.vec3f(3, 4, 5), // column 1
      d.vec3f(6, 7, 8), // column 2
    );

    mat[0] = 9;
    mat[1] = 10;
    mat[2] = 11;
    mat[4] = 12;
    mat[5] = 13;
    mat[6] = 14;

    expect(mat.columns[0]).toStrictEqual(d.vec3f(9, 10, 11));
    expect(mat.columns[1]).toStrictEqual(d.vec3f(12, 13, 14));
    expect(mat.columns[2]).toStrictEqual(d.vec3f(6, 7, 8));
    expect(d.matToArray(mat)).toStrictEqual([9, 10, 11, 12, 13, 14, 6, 7, 8]);

    mat[8] = 15;
    mat[9] = 16;
    mat[10] = 17;

    expect(mat.columns[0]).toStrictEqual(d.vec3f(9, 10, 11));
    expect(mat.columns[1]).toStrictEqual(d.vec3f(12, 13, 14));
    expect(mat.columns[2]).toStrictEqual(d.vec3f(15, 16, 17));
    expect(d.matToArray(mat)).toStrictEqual([
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
    ]);
  });

  it('creates a matrix that resolves properly', () => {
    const mat = d.mat3x3f(
      d.vec3f(0, 1, 2), // column 0
      d.vec3f(3, 4, 5), // column 1
      d.vec3f(6, 7, 8), // column 2
    );

    expect(tgpu.resolve({ template: 'mat', externals: { mat } })).toContain(
      'mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8)',
    );
  });

  it('should work with for...of', () => {
    const mat = d.mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8);
    let i = 0;
    for (const x of mat) {
      expect(x).toBe(mat[i]);
      expect(x).toBeDefined();
      i++;
    }
    expect(i).toBe(12);
  });
});

describe('mat4x4f', () => {
  it('creates a 4x4 matrix with zeros', () => {
    const zero4x4 = d.mat4x4f();
    expect(zero4x4.columns[0]).toStrictEqual(d.vec4f(0, 0, 0, 0));
    expect(zero4x4.columns[1]).toStrictEqual(d.vec4f(0, 0, 0, 0));
    expect(zero4x4.columns[2]).toStrictEqual(d.vec4f(0, 0, 0, 0));
    expect(zero4x4.columns[3]).toStrictEqual(d.vec4f(0, 0, 0, 0));
  });

  it('creates a 4x4 matrix with given elements', () => {
    const mat = d.mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    expect(mat.columns[0]).toStrictEqual(d.vec4f(0, 1, 2, 3));
    expect(mat.columns[1]).toStrictEqual(d.vec4f(4, 5, 6, 7));
    expect(mat.columns[2]).toStrictEqual(d.vec4f(8, 9, 10, 11));
    expect(mat.columns[3]).toStrictEqual(d.vec4f(12, 13, 14, 15));
  });

  it('creates a 4x4 matrix with given column vectors', () => {
    const v0 = d.vec4f(0, 1, 2, 3);
    const v1 = d.vec4f(4, 5, 6, 7);
    const v2 = d.vec4f(8, 9, 10, 11);
    const v3 = d.vec4f(12, 13, 14, 15);
    const mat = d.mat4x4f(v0, v1, v2, v3);
    expect(mat.columns[0]).toStrictEqual(v0);
    expect(mat.columns[1]).toStrictEqual(v1);
    expect(mat.columns[2]).toStrictEqual(v2);
    expect(mat.columns[3]).toStrictEqual(v3);
  });

  it('encodes identity matrix properly', () => {
    const identity = d.mat4x4f(
      d.vec4f(1, 0, 0, 0), // column 0
      d.vec4f(0, 1, 0, 0), // column 1
      d.vec4f(0, 0, 1, 0), // column 2
      d.vec4f(0, 0, 0, 1), // column 3
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat4x4f));

    writeData(new BufferWriter(buffer), d.mat4x4f, identity);
    expect(readData(new BufferReader(buffer), d.mat4x4f)).toStrictEqual(
      identity,
    );
  });

  it('encodes a matrix properly', () => {
    const mat = d.mat4x4f(
      d.vec4f(0, 1, 2, 3), // column 0
      d.vec4f(4, 5, 6, 7), // column 1
      d.vec4f(8, 9, 10, 11), // column 2
      d.vec4f(12, 13, 14, 15), // column 3
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat4x4f));

    writeData(new BufferWriter(buffer), d.mat4x4f, mat);
    expect(readData(new BufferReader(buffer), d.mat4x4f)).toStrictEqual(mat);
  });

  it('can be indexed into', () => {
    const mat = d.mat4x4f(
      d.vec4f(0, 1, 2, 3), // column 0
      d.vec4f(4, 5, 6, 7), // column 1
      d.vec4f(8, 9, 10, 11), // column 2
      d.vec4f(12, 13, 14, 15), // column 3
    );

    expect(d.matToArray(mat)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(mat).toHaveLength(16);
    expect(mat[0]).toBe(0);
    expect(mat[1]).toBe(1);
    expect(mat[2]).toBe(2);
    expect(mat[3]).toBe(3);
    expect(mat[4]).toBe(4);
    expect(mat[5]).toBe(5);
    expect(mat[6]).toBe(6);
    expect(mat[7]).toBe(7);
    expect(mat[8]).toBe(8);
    expect(mat[9]).toBe(9);
    expect(mat[10]).toBe(10);
    expect(mat[11]).toBe(11);
    expect(mat[12]).toBe(12);
    expect(mat[13]).toBe(13);
    expect(mat[14]).toBe(14);
    expect(mat[15]).toBe(15);
  });

  it('is mutable through indexing', () => {
    const mat = d.mat4x4f(
      d.vec4f(0, 1, 2, 3), // column 0
      d.vec4f(4, 5, 6, 7), // column 1
      d.vec4f(8, 9, 10, 11), // column 2
      d.vec4f(12, 13, 14, 15), // column 3
    );

    expect(mat.columns[0]).toStrictEqual(d.vec4f(0, 1, 2, 3));
    expect(mat.columns[1]).toStrictEqual(d.vec4f(4, 5, 6, 7));
    expect(mat.columns[2]).toStrictEqual(d.vec4f(8, 9, 10, 11));
    expect(mat.columns[3]).toStrictEqual(d.vec4f(12, 13, 14, 15));
    expect(d.matToArray(mat)).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

    mat[0] = 16;
    mat[1] = 17;
    mat[2] = 18;
    mat[3] = 19;

    expect(mat.columns[0]).toStrictEqual(d.vec4f(16, 17, 18, 19));
    expect(mat.columns[1]).toStrictEqual(d.vec4f(4, 5, 6, 7));
    expect(mat.columns[2]).toStrictEqual(d.vec4f(8, 9, 10, 11));
    expect(mat.columns[3]).toStrictEqual(d.vec4f(12, 13, 14, 15));
    expect(d.matToArray(mat)).toStrictEqual([16, 17, 18, 19, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('creates a matrix that resolves properly', () => {
    const mat = d.mat4x4f(
      d.vec4f(0, 1, 2, 3), // column 0
      d.vec4f(4, 5, 6, 7), // column 1
      d.vec4f(8, 9, 10, 11), // column 2
      d.vec4f(12, 13, 14, 15), // column 3
    );

    expect(tgpu.resolve({ template: 'mat', externals: { mat } })).toContain(
      'mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15)',
    );
  });

  it('should work with for...of', () => {
    const mat = d.mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    let i = 0;
    for (const x of mat) {
      expect(x).toBe(mat[i]);
      expect(x).toBeDefined();
      i++;
    }
    expect(i).toBe(16);
  });

  it('has correct column types', () => {
    expectTypeOf(d.mat2x2f().columns).toEqualTypeOf<readonly [d.v2f, d.v2f]>();
    expectTypeOf(d.mat3x3f().columns).toEqualTypeOf<
      readonly [d.v3f, d.v3f, d.v3f]
    >();
    expectTypeOf(d.mat4x4f().columns).toEqualTypeOf<
      readonly [d.v4f, d.v4f, d.v4f, d.v4f]
    >();
  });
});

describe('different matrix constructors', () => {
  it('returns identity matrix of size 2x2', () => {
    expect(d.mat2x2f.identity()).toStrictEqual(
      d.mat2x2f(d.vec2f(1, 0), d.vec2f(0, 1)),
    );
  });

  it('returns identity matrix of size 3x3', () => {
    expect(d.mat3x3f.identity()).toStrictEqual(
      d.mat3x3f(d.vec3f(1, 0, 0), d.vec3f(0, 1, 0), d.vec3f(0, 0, 1)),
    );
  });

  it('returns identity matrix of size 4x4', () => {
    expect(d.mat4x4f.identity()).toStrictEqual(
      d.mat4x4f(
        d.vec4f(1, 0, 0, 0),
        d.vec4f(0, 1, 0, 0),
        d.vec4f(0, 0, 1, 0),
        d.vec4f(0, 0, 0, 1),
      ),
    );
  });

  it('returns translation matrix', () => {
    expect(d.mat4x4f.translation(d.vec3f(3, 4, 5))).toStrictEqual(
      d.mat4x4f(
        d.vec4f(1, 0, 0, 0),
        d.vec4f(0, 1, 0, 0),
        d.vec4f(0, 0, 1, 0),
        d.vec4f(3, 4, 5, 1),
      ),
    );
  });

  it('returns scaling matrix', () => {
    expect(d.mat4x4f.scaling(d.vec3f(3, 4, 5))).toStrictEqual(
      d.mat4x4f(
        d.vec4f(3, 0, 0, 0),
        d.vec4f(0, 4, 0, 0),
        d.vec4f(0, 0, 5, 0),
        d.vec4f(0, 0, 0, 1),
      ),
    );
  });

  it('returns rotationX matrix', () => {
    const result = d.mat4x4f.rotationX(Math.PI / 2);
    expect(isCloseTo(result.columns[0], d.vec4f(1, 0, 0, 0))).toBe(true);
    expect(isCloseTo(result.columns[1], d.vec4f(0, 0, 1, 0))).toBe(true);
    expect(isCloseTo(result.columns[2], d.vec4f(0, -1, 0, 0))).toBe(true);
    expect(isCloseTo(result.columns[3], d.vec4f(0, 0, 0, 1))).toBe(true);
  });

  it('returns rotationY matrix', () => {
    const result = d.mat4x4f.rotationY(Math.PI / 2);
    expect(isCloseTo(result.columns[0], d.vec4f(0, 0, -1, 0))).toBe(true);
    expect(isCloseTo(result.columns[1], d.vec4f(0, 1, 0, 0))).toBe(true);
    expect(isCloseTo(result.columns[2], d.vec4f(1, 0, 0, 0))).toBe(true);
    expect(isCloseTo(result.columns[3], d.vec4f(0, 0, 0, 1))).toBe(true);
  });

  it('returns rotationZ matrix', () => {
    const result = d.mat4x4f.rotationZ(Math.PI / 2);
    expect(isCloseTo(result.columns[0], d.vec4f(0, 1, 0, 0))).toBe(true);
    expect(isCloseTo(result.columns[1], d.vec4f(-1, 0, 0, 0))).toBe(true);
    expect(isCloseTo(result.columns[2], d.vec4f(0, 0, 1, 0))).toBe(true);
    expect(isCloseTo(result.columns[3], d.vec4f(0, 0, 0, 1))).toBe(true);
  });
});
