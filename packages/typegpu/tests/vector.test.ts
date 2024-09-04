import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { vec2f, vec3f, vec4f } from '../src/data';

describe('vec2f', () => {
  it('should create a zero 2d vector', () => {
    const zero = vec2f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const zero = vec2f(1, 2);
    expect(zero.x).toEqual(1);
    expect(zero.y).toEqual(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const zero = vec2f(5);
    expect(zero.x).toEqual(5);
    expect(zero.y).toEqual(5);
  });

  it('should encode a 2d vector', () => {
    const vec = vec2f(1, 2);

    const buffer = new ArrayBuffer(vec2f.size);

    vec2f.write(new BufferWriter(buffer), vec);
    expect(vec2f.read(new BufferReader(buffer))).toEqual(vec);
  });
});

describe('vec3f', () => {
  it('should create a zero 3d vector', () => {
    const zero = vec3f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
    expect(zero.z).toEqual(0);
  });

  it('should create a 3d vector with the given elements', () => {
    const zero = vec3f(1, 2, 3);
    expect(zero.x).toEqual(1);
    expect(zero.y).toEqual(2);
    expect(zero.z).toEqual(3);
  });

  it('should create a 3d vector from the given scalar element', () => {
    const zero = vec3f(5);
    expect(zero.x).toEqual(5);
    expect(zero.y).toEqual(5);
    expect(zero.z).toEqual(5);
  });

  it('should encode a 3d vector', () => {
    const vec = vec3f(1, 2, 3);

    const buffer = new ArrayBuffer(vec3f.size);

    vec3f.write(new BufferWriter(buffer), vec);
    expect(vec3f.read(new BufferReader(buffer))).toEqual(vec);
  });
});

describe('vec4f', () => {
  it('should create a zero 4d vector', () => {
    const zero = vec4f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
    expect(zero.z).toEqual(0);
    expect(zero.w).toEqual(0);
  });

  it('should create a 4d vector with the given elements', () => {
    const zero = vec4f(1, 2, 3, 4);
    expect(zero.x).toEqual(1);
    expect(zero.y).toEqual(2);
    expect(zero.z).toEqual(3);
    expect(zero.w).toEqual(4);
  });

  it('should create a 4d vector from the given scalar element', () => {
    const zero = vec4f(5);
    expect(zero.x).toEqual(5);
    expect(zero.y).toEqual(5);
    expect(zero.z).toEqual(5);
    expect(zero.w).toEqual(5);
  });

  it('should encode a 4d vector', () => {
    const vec = vec4f(1, 2, 3, 4);

    const buffer = new ArrayBuffer(vec4f.size);

    vec4f.write(new BufferWriter(buffer), vec);
    expect(vec4f.read(new BufferReader(buffer))).toEqual(vec);
  });
});
