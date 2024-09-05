import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { mat2x2f, mat3x3f, mat4x4f, vec2f, vec3f, vec4f } from '../src/data';

describe('mat2x2f', () => {
  it('creates a 2x2 matrix with zeros', () => {
    const zero2x2 = mat2x2f();
    expect(zero2x2[0]).toEqual(vec2f());
    expect(zero2x2[1]).toEqual(vec2f());
  });

  it('creates a 2x2 matrix with given elements', () => {
    const mat = mat2x2f(0, 1, 2, 3);
    expect(mat[0]).toEqual(vec2f(0, 1));
    expect(mat[1]).toEqual(vec2f(2, 3));
  });

  it('creates a 2x2 matrix with given column vectors', () => {
    const v0 = vec2f(0, 1);
    const v1 = vec2f(1, 2);
    const mat = mat2x2f(v0, v1);
    expect(mat[0]).toEqual(v0);
    expect(mat[1]).toEqual(v1);
  });

  it('encodes identity matrix properly', () => {
    const identity = mat2x2f(
      vec2f(1, 0), // column 0
      vec2f(0, 1), // column 1
    );

    const buffer = new ArrayBuffer(mat2x2f.size);

    mat2x2f.write(new BufferWriter(buffer), identity);
    expect(mat2x2f.read(new BufferReader(buffer))).toEqual(identity);
  });

  it('encodes a matrix properly', () => {
    const mat = mat2x2f(
      vec2f(0, 1), // column 0
      vec2f(2, 3), // column 1
    );

    const buffer = new ArrayBuffer(mat2x2f.size);

    mat2x2f.write(new BufferWriter(buffer), mat);
    expect(mat2x2f.read(new BufferReader(buffer))).toEqual(mat);
  });
});

describe('mat3x3f', () => {
  it('creates a 3x3 matrix with zeros', () => {
    const zero3x3 = mat3x3f();
    expect(zero3x3[0]).toEqual(vec3f());
    expect(zero3x3[1]).toEqual(vec3f());
    expect(zero3x3[2]).toEqual(vec3f());
  });

  it('creates a 3x3 matrix with given elements', () => {
    const mat = mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8);
    expect(mat[0]).toEqual(vec3f(0, 1, 2));
    expect(mat[1]).toEqual(vec3f(3, 4, 5));
    expect(mat[2]).toEqual(vec3f(6, 7, 8));
  });

  it('creates a 3x3 matrix with given column vectors', () => {
    const v0 = vec3f(0, 1, 2);
    const v1 = vec3f(3, 4, 5);
    const v2 = vec3f(6, 7, 8);
    const mat = mat3x3f(v0, v1, v2);
    expect(mat[0]).toEqual(v0);
    expect(mat[1]).toEqual(v1);
    expect(mat[2]).toEqual(v2);
  });

  it('encodes identity matrix properly', () => {
    const identity = mat3x3f(
      vec3f(1, 0, 0), // column 0
      vec3f(0, 1, 0), // column 1
      vec3f(0, 0, 1), // column 2
    );

    const buffer = new ArrayBuffer(mat3x3f.size);

    mat3x3f.write(new BufferWriter(buffer), identity);
    expect(mat3x3f.read(new BufferReader(buffer))).toEqual(identity);
  });

  it('encodes a matrix properly', () => {
    const mat = mat3x3f(
      vec3f(0, 1, 2), // column 0
      vec3f(3, 4, 5), // column 1
      vec3f(6, 7, 8), // column 2
    );

    const buffer = new ArrayBuffer(mat3x3f.size);

    mat3x3f.write(new BufferWriter(buffer), mat);
    expect(mat3x3f.read(new BufferReader(buffer))).toEqual(mat);
  });
});

describe('mat4x4f', () => {
  it('creates a 4x4 matrix with zeros', () => {
    const zero4x4 = mat4x4f();
    expect(zero4x4[0]).toEqual(vec4f(0, 0, 0, 0));
    expect(zero4x4[1]).toEqual(vec4f(0, 0, 0, 0));
    expect(zero4x4[2]).toEqual(vec4f(0, 0, 0, 0));
    expect(zero4x4[3]).toEqual(vec4f(0, 0, 0, 0));
  });

  it('creates a 4x4 matrix with given elements', () => {
    const mat = mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
    expect(mat[0]).toEqual(vec4f(0, 1, 2, 3));
    expect(mat[1]).toEqual(vec4f(4, 5, 6, 7));
    expect(mat[2]).toEqual(vec4f(8, 9, 10, 11));
    expect(mat[3]).toEqual(vec4f(12, 13, 14, 15));
  });

  it('creates a 4x4 matrix with given column vectors', () => {
    const v0 = vec4f(0, 1, 2, 3);
    const v1 = vec4f(4, 5, 6, 7);
    const v2 = vec4f(8, 9, 10, 11);
    const v3 = vec4f(12, 13, 14, 15);
    const mat = mat4x4f(v0, v1, v2, v3);
    expect(mat[0]).toEqual(v0);
    expect(mat[1]).toEqual(v1);
    expect(mat[2]).toEqual(v2);
    expect(mat[3]).toEqual(v3);
  });

  it('encodes identity matrix properly', () => {
    const identity = mat4x4f(
      vec4f(1, 0, 0, 0), // column 0
      vec4f(0, 1, 0, 0), // column 1
      vec4f(0, 0, 1, 0), // column 2
      vec4f(0, 0, 0, 1), // column 3
    );

    const buffer = new ArrayBuffer(mat4x4f.size);

    mat4x4f.write(new BufferWriter(buffer), identity);
    expect(mat4x4f.read(new BufferReader(buffer))).toEqual(identity);
  });

  it('encodes a matrix properly', () => {
    const mat = mat4x4f(
      vec4f(0, 1, 2, 3), // column 0
      vec4f(4, 5, 6, 7), // column 1
      vec4f(8, 9, 10, 11), // column 2
      vec4f(12, 13, 14, 15), // column 3
    );

    const buffer = new ArrayBuffer(mat4x4f.size);

    mat4x4f.write(new BufferWriter(buffer), mat);
    expect(mat4x4f.read(new BufferReader(buffer))).toEqual(mat);
  });
});
