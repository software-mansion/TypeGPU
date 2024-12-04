import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import * as d from '../src/data';
import { readData, writeData } from '../src/data/dataIO';

describe('mat2x2f', () => {
  it('creates a 2x2 matrix with zeros', () => {
    const zero2x2 = d.mat2x2f();
    expect(zero2x2.columns[0]).toEqual(d.vec2f());
    expect(zero2x2.columns[1]).toEqual(d.vec2f());
  });

  it('creates a 2x2 matrix with given elements', () => {
    const mat = d.mat2x2f(0, 1, 2, 3);
    expect(mat.columns[0]).toEqual(d.vec2f(0, 1));
    expect(mat.columns[1]).toEqual(d.vec2f(2, 3));
  });

  it('creates a 2x2 matrix with given column vectors', () => {
    const v0 = d.vec2f(0, 1);
    const v1 = d.vec2f(1, 2);
    const mat = d.mat2x2f(v0, v1);
    expect(mat.columns[0]).toEqual(v0);
    expect(mat.columns[1]).toEqual(v1);
  });

  it('encodes identity matrix properly', () => {
    const identity = d.mat2x2f(
      d.vec2f(1, 0), // column 0
      d.vec2f(0, 1), // column 1
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat2x2f));

    writeData(new BufferWriter(buffer), d.mat2x2f, identity);
    expect(readData(new BufferReader(buffer), d.mat2x2f)).toEqual(identity);
  });

  it('encodes a matrix properly', () => {
    const mat = d.mat2x2f(
      d.vec2f(0, 1), // column 0
      d.vec2f(2, 3), // column 1
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat2x2f));

    writeData(new BufferWriter(buffer), d.mat2x2f, mat);
    expect(readData(new BufferReader(buffer), d.mat2x2f)).toEqual(mat);
  });

  it('can be indexed into', () => {
    const mat = d.mat2x2f(
      d.vec2f(0, 1), // column 0
      d.vec2f(2, 3), // column 1
    );

    expect(d.mat2x2fToArray(mat)).toEqual([0, 1, 2, 3]);
    expect(mat.length).toEqual(4);
    expect(mat[0]).toEqual(0);
    expect(mat[1]).toEqual(1);
    expect(mat[2]).toEqual(2);
    expect(mat[3]).toEqual(3);
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

    expect(mat.columns[0]).toEqual(d.vec2f(4, 5));
    expect(mat.columns[1]).toEqual(d.vec2f(6, 7));
    expect(d.mat2x2fToArray(mat)).toEqual([4, 5, 6, 7]);
  });
});

describe('mat3x3f', () => {
  it('creates a 3x3 matrix with zeros', () => {
    const zero3x3 = d.mat3x3f();
    expect(zero3x3.columns[0]).toEqual(d.vec3f());
    expect(zero3x3.columns[1]).toEqual(d.vec3f());
    expect(zero3x3.columns[2]).toEqual(d.vec3f());
  });

  it('creates a 3x3 matrix with given elements', () => {
    const mat = d.mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(mat.columns[0]).toEqual(d.vec3f(0, 1, 2));
    expect(mat.columns[1]).toEqual(d.vec3f(3, 4, 5));
    expect(mat.columns[2]).toEqual(d.vec3f(6, 7, 8));
  });

  it('creates a 3x3 matrix with given column vectors', () => {
    const v0 = d.vec3f(0, 1, 2);
    const v1 = d.vec3f(3, 4, 5);
    const v2 = d.vec3f(6, 7, 8);
    const mat = d.mat3x3f(v0, v1, v2);
    expect(mat.columns[0]).toEqual(v0);
    expect(mat.columns[1]).toEqual(v1);
    expect(mat.columns[2]).toEqual(v2);
  });

  it('encodes identity matrix properly', () => {
    const identity = d.mat3x3f(
      d.vec3f(1, 0, 0), // column 0
      d.vec3f(0, 1, 0), // column 1
      d.vec3f(0, 0, 1), // column 2
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat3x3f));

    writeData(new BufferWriter(buffer), d.mat3x3f, identity);
    expect(readData(new BufferReader(buffer), d.mat3x3f)).toEqual(identity);
  });

  it('encodes a matrix properly', () => {
    const mat = d.mat3x3f(
      d.vec3f(0, 1, 2), // column 0
      d.vec3f(3, 4, 5), // column 1
      d.vec3f(6, 7, 8), // column 2
    );

    const buffer = new ArrayBuffer(d.sizeOf(d.mat3x3f));

    writeData(new BufferWriter(buffer), d.mat3x3f, mat);
    expect(readData(new BufferReader(buffer), d.mat3x3f)).toEqual(mat);
  });

  it('can be indexed into', () => {
    const mat = d.mat3x3f(
      d.vec3f(0, 1, 2), // column 0
      d.vec3f(3, 4, 5), // column 1
      d.vec3f(6, 7, 8), // column 2
    );

    expect(d.mat3x3fToArray(mat)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(mat.length).toEqual(12);
    expect(mat[0]).toEqual(0);
    expect(mat[1]).toEqual(1);
    expect(mat[2]).toEqual(2);
    expect(mat[3]).toEqual(0);
    expect(mat[4]).toEqual(3);
    expect(mat[5]).toEqual(4);
    expect(mat[6]).toEqual(5);
    expect(mat[7]).toEqual(0);
    expect(mat[8]).toEqual(6);
    expect(mat[9]).toEqual(7);
    expect(mat[10]).toEqual(8);
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

    expect(mat.columns[0]).toEqual(d.vec3f(9, 10, 11));
    expect(mat.columns[1]).toEqual(d.vec3f(12, 13, 14));
    expect(mat.columns[2]).toEqual(d.vec3f(6, 7, 8));
    expect(d.mat3x3fToArray(mat)).toEqual([9, 10, 11, 12, 13, 14, 6, 7, 8]);

    mat[8] = 15;
    mat[9] = 16;
    mat[10] = 17;

    expect(mat.columns[0]).toEqual(d.vec3f(9, 10, 11));
    expect(mat.columns[1]).toEqual(d.vec3f(12, 13, 14));
    expect(mat.columns[2]).toEqual(d.vec3f(15, 16, 17));
    expect(d.mat3x3fToArray(mat)).toEqual([9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
});

describe('mat4x4f', () => {
  it('creates a 4x4 matrix with zeros', () => {
    const zero4x4 = d.mat4x4f();
    expect(zero4x4.columns[0]).toEqual(d.vec4f(0, 0, 0, 0));
    expect(zero4x4.columns[1]).toEqual(d.vec4f(0, 0, 0, 0));
    expect(zero4x4.columns[2]).toEqual(d.vec4f(0, 0, 0, 0));
    expect(zero4x4.columns[3]).toEqual(d.vec4f(0, 0, 0, 0));
  });

  it('creates a 4x4 matrix with given elements', () => {
    const mat = d.mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    expect(mat.columns[0]).toEqual(d.vec4f(0, 1, 2, 3));
    expect(mat.columns[1]).toEqual(d.vec4f(4, 5, 6, 7));
    expect(mat.columns[2]).toEqual(d.vec4f(8, 9, 10, 11));
    expect(mat.columns[3]).toEqual(d.vec4f(12, 13, 14, 15));
  });

  it('creates a 4x4 matrix with given column vectors', () => {
    const v0 = d.vec4f(0, 1, 2, 3);
    const v1 = d.vec4f(4, 5, 6, 7);
    const v2 = d.vec4f(8, 9, 10, 11);
    const v3 = d.vec4f(12, 13, 14, 15);
    const mat = d.mat4x4f(v0, v1, v2, v3);
    expect(mat.columns[0]).toEqual(v0);
    expect(mat.columns[1]).toEqual(v1);
    expect(mat.columns[2]).toEqual(v2);
    expect(mat.columns[3]).toEqual(v3);
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
    expect(readData(new BufferReader(buffer), d.mat4x4f)).toEqual(identity);
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
    expect(readData(new BufferReader(buffer), d.mat4x4f)).toEqual(mat);
  });

  it('can be indexed into', () => {
    const mat = d.mat4x4f(
      d.vec4f(0, 1, 2, 3), // column 0
      d.vec4f(4, 5, 6, 7), // column 1
      d.vec4f(8, 9, 10, 11), // column 2
      d.vec4f(12, 13, 14, 15), // column 3
    );

    expect(d.mat4x4fToArray(mat)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
    expect(mat.length).toEqual(16);
    expect(mat[0]).toEqual(0);
    expect(mat[1]).toEqual(1);
    expect(mat[2]).toEqual(2);
    expect(mat[3]).toEqual(3);
    expect(mat[4]).toEqual(4);
    expect(mat[5]).toEqual(5);
    expect(mat[6]).toEqual(6);
    expect(mat[7]).toEqual(7);
    expect(mat[8]).toEqual(8);
    expect(mat[9]).toEqual(9);
    expect(mat[10]).toEqual(10);
    expect(mat[11]).toEqual(11);
    expect(mat[12]).toEqual(12);
    expect(mat[13]).toEqual(13);
    expect(mat[14]).toEqual(14);
    expect(mat[15]).toEqual(15);
  });

  it('is mutable through indexing', () => {
    const mat = d.mat4x4f(
      d.vec4f(0, 1, 2, 3), // column 0
      d.vec4f(4, 5, 6, 7), // column 1
      d.vec4f(8, 9, 10, 11), // column 2
      d.vec4f(12, 13, 14, 15), // column 3
    );

    expect(mat.columns[0]).toEqual(d.vec4f(0, 1, 2, 3));
    expect(mat.columns[1]).toEqual(d.vec4f(4, 5, 6, 7));
    expect(mat.columns[2]).toEqual(d.vec4f(8, 9, 10, 11));
    expect(mat.columns[3]).toEqual(d.vec4f(12, 13, 14, 15));
    expect(d.mat4x4fToArray(mat)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);

    mat[0] = 16;
    mat[1] = 17;
    mat[2] = 18;
    mat[3] = 19;

    expect(mat.columns[0]).toEqual(d.vec4f(16, 17, 18, 19));
    expect(mat.columns[1]).toEqual(d.vec4f(4, 5, 6, 7));
    expect(mat.columns[2]).toEqual(d.vec4f(8, 9, 10, 11));
    expect(mat.columns[3]).toEqual(d.vec4f(12, 13, 14, 15));
    expect(d.mat4x4fToArray(mat)).toEqual([
      16, 17, 18, 19, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
    ]);
  });
});
