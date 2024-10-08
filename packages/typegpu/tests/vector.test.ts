import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import * as d from '../src/data';

describe('vec2f', () => {
  it('should create a zero 2d vector', () => {
    const zero = d.vec2f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const zero = d.vec2f(1, 2);
    expect(zero.x).toEqual(1);
    expect(zero.y).toEqual(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const zero = d.vec2f(5);
    expect(zero.x).toEqual(5);
    expect(zero.y).toEqual(5);
  });

  it('should encode a 2d vector', () => {
    const vec = d.vec2f(1, 2);

    const buffer = new ArrayBuffer(d.vec2f.size);

    d.vec2f.write(new BufferWriter(buffer), vec);
    expect(d.vec2f.read(new BufferReader(buffer))).toEqual(vec);
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec2fSchema = (_schema: d.Vec2f) => {};

    acceptsVec2fSchema(d.vec2f);
    // @ts-expect-error
    acceptsVec2fSchema(d.vec2u);
    // @ts-expect-error
    acceptsVec2fSchema(d.vec2i);
    // @ts-expect-error
    acceptsVec2fSchema(d.vec3f);
    // @ts-expect-error
    acceptsVec2fSchema(d.vec4f);
  });
});

describe('vec3f', () => {
  it('should create a zero 3d vector', () => {
    const zero = d.vec3f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
    expect(zero.z).toEqual(0);
  });

  it('should create a 3d vector with the given elements', () => {
    const zero = d.vec3f(1, 2, 3);
    expect(zero.x).toEqual(1);
    expect(zero.y).toEqual(2);
    expect(zero.z).toEqual(3);
  });

  it('should create a 3d vector from the given scalar element', () => {
    const zero = d.vec3f(5);
    expect(zero.x).toEqual(5);
    expect(zero.y).toEqual(5);
    expect(zero.z).toEqual(5);
  });

  it('should encode a 3d vector', () => {
    const vec = d.vec3f(1, 2, 3);

    const buffer = new ArrayBuffer(d.vec3f.size);

    d.vec3f.write(new BufferWriter(buffer), vec);
    expect(d.vec3f.read(new BufferReader(buffer))).toEqual(vec);
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec3fSchema = (_schema: d.Vec3f) => {};

    acceptsVec3fSchema(d.vec3f);
    // @ts-expect-error
    acceptsVec3fSchema(d.vec3u);
    // @ts-expect-error
    acceptsVec3fSchema(d.vec3i);
    // @ts-expect-error
    acceptsVec3fSchema(d.vec2f);
    // @ts-expect-error
    acceptsVec3fSchema(d.vec4f);
  });
});

describe('vec4f', () => {
  it('should create a zero 4d vector', () => {
    const zero = d.vec4f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
    expect(zero.z).toEqual(0);
    expect(zero.w).toEqual(0);
  });

  it('should create a 4d vector with the given elements', () => {
    const zero = d.vec4f(1, 2, 3, 4);
    expect(zero.x).toEqual(1);
    expect(zero.y).toEqual(2);
    expect(zero.z).toEqual(3);
    expect(zero.w).toEqual(4);
  });

  it('should create a 4d vector from the given scalar element', () => {
    const zero = d.vec4f(5);
    expect(zero.x).toEqual(5);
    expect(zero.y).toEqual(5);
    expect(zero.z).toEqual(5);
    expect(zero.w).toEqual(5);
  });

  it('should encode a 4d vector', () => {
    const vec = d.vec4f(1, 2, 3, 4);

    const buffer = new ArrayBuffer(d.vec4f.size);

    d.vec4f.write(new BufferWriter(buffer), vec);
    expect(d.vec4f.read(new BufferReader(buffer))).toEqual(vec);
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec4fSchema = (_schema: d.Vec4f) => {};

    acceptsVec4fSchema(d.vec4f);
    // @ts-expect-error
    acceptsVec4fSchema(d.vec4u);
    // @ts-expect-error
    acceptsVec4fSchema(d.vec4i);
    // @ts-expect-error
    acceptsVec4fSchema(d.vec2f);
    // @ts-expect-error
    acceptsVec4fSchema(d.vec3f);
  });
});
