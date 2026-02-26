import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { readData, writeData } from '../src/data/dataIO.ts';
import { sizeOf } from '../src/data/sizeOf.ts';
import tgpu, { d } from '../src/index.js';
import * as std from '../src/std/index.ts';

describe('constructors', () => {
  it('casts floats to signed integers', () => {
    expect(d.vec2i(1.1, -1.1)).toStrictEqual(d.vec2i(1, -1));
    expect(d.vec3i(1.7, 2.6, 0.0)).toStrictEqual(d.vec3i(1, 2, 0));
    expect(d.vec4i(1.1, -1.1, -10.2, -1.0)).toStrictEqual(
      d.vec4i(1, -1, -10, -1),
    );
  });

  it('casts floats to unsigned integers', () => {
    expect(d.vec2u(1.1, -1)).toStrictEqual(d.vec2u(1, 4294967295));
    expect(d.vec3u(1.7, 2.6, 0.0)).toStrictEqual(d.vec3u(1, 2, 0));
    expect(d.vec4u(1.1, 1.1, 10.2, 1.0)).toStrictEqual(d.vec4u(1, 1, 10, 1));
  });
});

describe('setters', () => {
  it('coerces to singed integer values', () => {
    const vec = d.vec4i();
    vec[0] = 1.1;
    vec[1] = -1.1;
    vec.z = 2.2;
    vec.w = -2.2;
    expect(vec).toStrictEqual(d.vec4i(1, -1, 2, -2));
  });

  it('coerces to unsigned integer values', () => {
    const vec = d.vec3u();
    vec[0] = 1.1;
    vec[1] = -1.1;
    vec.z = 2.2;
    expect(vec).toStrictEqual(d.vec3u(1, 0, 2));
  });
});

describe('vec2f', () => {
  it('should span 8 bytes', () => {
    expect(sizeOf(d.vec2f)).toBe(8);
  });

  it('should create a zero 2d vector', () => {
    const zero = d.vec2f();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const vec = d.vec2f(1, 2);
    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const vec = d.vec2f(5);
    expect(vec.x).toBe(5);
    expect(vec.y).toBe(5);
  });

  it('should encode a 2d vector', () => {
    const vec = d.vec2f(1, 2);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec2f));

    writeData(new BufferWriter(buffer), d.vec2f, vec);
    expect(readData(new BufferReader(buffer), d.vec2f)).toStrictEqual(vec);
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

  it('can be indexed into', () => {
    const vec = d.vec2f(1, 2);
    expect(vec[0]).toBe(1);
    expect(vec[1]).toBe(2);
  });

  it('can be modified via index', () => {
    const vec = d.vec2f(1, 2);
    vec[0] = 3;
    vec[1] = 4;
    expect(vec).toStrictEqual(d.vec2f(3, 4));
  });

  it('should work with for...of', () => {
    const vec = d.vec2f(0, 1);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeNumber();
      i++;
    }
    expect(i).toBe(2);
  });

  it('can be destructured', () => {
    const vec = d.vec2f(5, 6);
    const [x, y] = vec;
    expect(x).toBe(5);
    expect(y).toBe(6);
    expectTypeOf(x).toBeNumber();
    expectTypeOf(y).toBeNumber();
  });
});

describe('vec2i', () => {
  it('should span 8 bytes', () => {
    expect(sizeOf(d.vec2i)).toBe(8);
  });

  it('should create a zero 2d vector', () => {
    const zero = d.vec2i();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const vec = d.vec2i(1, 2);
    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const vec = d.vec2i(5);
    expect(vec.x).toBe(5);
    expect(vec.y).toBe(5);
  });

  it('should encode a 2d vector', () => {
    const vec = d.vec2i(1, 2);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec2i));

    writeData(new BufferWriter(buffer), d.vec2i, vec);
    expect(readData(new BufferReader(buffer), d.vec2i)).toStrictEqual(vec);
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec2iSchema = (_schema: d.Vec2i) => {};

    acceptsVec2iSchema(d.vec2i);
    // @ts-expect-error
    acceptsVec2iSchema(d.vec2u);
    // @ts-expect-error
    acceptsVec2iSchema(d.vec2f);
    // @ts-expect-error
    acceptsVec2iSchema(d.vec3i);
    // @ts-expect-error
    acceptsVec2iSchema(d.vec4i);
  });

  it('can be indexed into', () => {
    const vec = d.vec2i(1, 2);
    expect(vec[0]).toBe(1);
    expect(vec[1]).toBe(2);
  });

  it('can be modified via index', () => {
    const vec = d.vec2i(1, 2);
    vec[0] = 3;
    vec[1] = 4;
    expect(vec).toStrictEqual(d.vec2i(3, 4));
  });

  it('should work with for...of', () => {
    const vec = d.vec2i(0, 1);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeNumber();
      i++;
    }
    expect(i).toBe(2);
  });

  it('can be destructured', () => {
    const vec = d.vec2i(5, 6);
    const [x, y] = vec;
    expect(x).toBe(5);
    expect(y).toBe(6);
    expectTypeOf(x).toBeNumber();
    expectTypeOf(y).toBeNumber();
  });
});

describe('vec2<bool>', () => {
  it('should create a zero 2d vector', () => {
    const zero = d.vec2b();
    expect(zero.x).toBe(false);
    expect(zero.y).toBe(false);
  });

  it('should create a 2d vector with the given elements', () => {
    const vec = d.vec2b(false, true);
    expect(vec.x).toBe(false);
    expect(vec.y).toBe(true);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const vec = d.vec2b(true);
    expect(vec.x).toBe(true);
    expect(vec.y).toBe(true);
  });

  it('is not host shareable', () => {
    const buffer = new ArrayBuffer(8);

    expect(() => writeData(new BufferWriter(buffer), d.vec2b, d.vec2b()))
      .toThrow();
    expect(() => readData(new BufferReader(buffer), d.vec2b)).toThrow();
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec2bSchema = (_schema: d.Vec2b) => {};

    acceptsVec2bSchema(d.vec2b);
    // @ts-expect-error
    acceptsVec2bSchema(d.vec2f);
    // @ts-expect-error
    acceptsVec2bSchema(d.vec2u);
    // @ts-expect-error
    acceptsVec2bSchema(d.vec2i);
    // @ts-expect-error
    acceptsVec2bSchema(d.vec3b);
    // @ts-expect-error
    acceptsVec2bSchema(d.vec4b);
  });

  it('can be indexed into', () => {
    const vec = d.vec2b(false, true);
    expect(vec[0]).toBe(false);
    expect(vec[1]).toBe(true);
  });

  it('can be modified via index', () => {
    const vec = d.vec2b(false, true);
    vec[0] = true;
    vec[1] = false;
    expect(vec).toStrictEqual(d.vec2b(true, false));
  });

  it('should create a vector using identity swizzle', () => {
    const vec = d.vec2b(false, true);
    const swizzled = vec.xy;
    expect(swizzled.x).toBe(false);
    expect(swizzled.y).toBe(true);
  });

  it('should create a vector using mixed swizzle', () => {
    const vec = d.vec2b(false, true);
    const swizzled = vec.yx;
    expect(swizzled.x).toBe(true);
    expect(swizzled.y).toBe(false);
  });

  it('should create a vector using swizzle with repeats', () => {
    const vec = d.vec2b(false, true);
    const swizzled = vec.yy;
    expect(swizzled.x).toBe(true);
    expect(swizzled.y).toBe(true);
  });

  it('should work with for...of', () => {
    const vec = d.vec2b(true, false);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeBoolean();
      i++;
    }
    expect(i).toBe(2);
  });

  it('can be destructured', () => {
    const vec = d.vec2b(false, true);
    const [x, y] = vec;
    expect(x).toBe(false);
    expect(y).toBe(true);
    expectTypeOf(x).toBeBoolean();
    expectTypeOf(y).toBeBoolean();
  });
});

describe('vec3f', () => {
  it('should span 12 bytes', () => {
    expect(sizeOf(d.vec3f)).toBe(12);
  });

  it('should create a zero 3d vector', () => {
    const zero = d.vec3f();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
    expect(zero.z).toBe(0);
  });

  it('should create a 3d vector with the given elements', () => {
    const vec = d.vec3f(1, 2, 3);
    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
    expect(vec.z).toBe(3);
  });

  it('should create a 3d vector from the given scalar element', () => {
    const vec = d.vec3f(5);
    expect(vec.x).toBe(5);
    expect(vec.y).toBe(5);
    expect(vec.z).toBe(5);
  });

  it('should encode a 3d vector', () => {
    const vec = d.vec3f(1, 2, 3);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec3f));

    writeData(new BufferWriter(buffer), d.vec3f, vec);
    expect(readData(new BufferReader(buffer), d.vec3f)).toStrictEqual(vec);
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

  it('can be indexed into', () => {
    const vec = d.vec3f(1, 2, 3);
    expect(vec[0]).toBe(1);
    expect(vec[1]).toBe(2);
    expect(vec[2]).toBe(3);
  });

  it('can be modified via index', () => {
    const vec = d.vec3f(1, 2, 3);
    vec[0] = 4;
    vec[1] = 5;
    vec[2] = 6;
    expect(vec).toStrictEqual(d.vec3f(4, 5, 6));
  });

  it('should work with for...of', () => {
    const vec = d.vec3f(1, 2, 3);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeNumber();
      i++;
    }
    expect(i).toBe(3);
  });

  it('can be destructured', () => {
    const vec = d.vec3f(5, 6, 7);
    const [x, y, z] = vec;
    expect(x).toBe(5);
    expect(y).toBe(6);
    expect(z).toBe(7);
    expectTypeOf(x).toBeNumber();
    expectTypeOf(y).toBeNumber();
    expectTypeOf(z).toBeNumber();
  });
});

describe('vec3i', () => {
  it('should span 12 bytes', () => {
    expect(sizeOf(d.vec3i)).toBe(12);
  });

  it('should create a zero 3d vector', () => {
    const zero = d.vec3i();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
    expect(zero.z).toBe(0);
  });

  it('should create a 3d vector with the given elements', () => {
    const vec = d.vec3i(1, 2, 3);
    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
    expect(vec.z).toBe(3);
  });

  it('should create a 3d vector from the given scalar element', () => {
    const vec = d.vec3i(5);
    expect(vec.x).toBe(5);
    expect(vec.y).toBe(5);
    expect(vec.z).toBe(5);
  });

  it('should encode a 3d vector', () => {
    const vec = d.vec3i(1, 2, 3);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec3i));

    writeData(new BufferWriter(buffer), d.vec3i, vec);
    expect(readData(new BufferReader(buffer), d.vec3i)).toStrictEqual(vec);
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec3iSchema = (_schema: d.Vec3i) => {};

    acceptsVec3iSchema(d.vec3i);
    // @ts-expect-error
    acceptsVec3iSchema(d.vec3u);
    // @ts-expect-error
    acceptsVec3iSchema(d.vec3f);
    // @ts-expect-error
    acceptsVec3iSchema(d.vec2i);
    // @ts-expect-error
    acceptsVec3iSchema(d.vec4i);
  });

  it('can be indexed into', () => {
    const vec = d.vec3i(1, 2, 3);
    expect(vec[0]).toBe(1);
    expect(vec[1]).toBe(2);
    expect(vec[2]).toBe(3);
  });

  it('can be modified via index', () => {
    const vec = d.vec3i(1, 2, 3);
    vec[0] = 4;
    vec[1] = 5;
    vec[2] = 6;
    expect(vec).toStrictEqual(d.vec3i(4, 5, 6));
  });

  it('should work with for...of', () => {
    const vec = d.vec3i(1, 2, 3);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeNumber();
      i++;
    }
    expect(i).toBe(3);
  });

  it('can be destructured', () => {
    const vec = d.vec3i(5, 6, 7);
    const [x, y, z] = vec;
    expect(x).toBe(5);
    expect(y).toBe(6);
    expect(z).toBe(7);
    expectTypeOf(x).toBeNumber();
    expectTypeOf(y).toBeNumber();
    expectTypeOf(z).toBeNumber();
  });
});

describe('vec3<bool>', () => {
  it('should create a zero 3d vector', () => {
    const zero = d.vec3b();
    expect(zero.x).toBe(false);
    expect(zero.y).toBe(false);
    expect(zero.z).toBe(false);
  });

  it('should create a 3d vector with the given elements', () => {
    const vec = d.vec3b(false, true, false);
    expect(vec.x).toBe(false);
    expect(vec.y).toBe(true);
    expect(vec.z).toBe(false);
  });

  it('should create a 3d vector from the given scalar element', () => {
    const vec = d.vec3b(true);
    expect(vec.x).toBe(true);
    expect(vec.y).toBe(true);
    expect(vec.z).toBe(true);
  });

  it('is not host shareable', () => {
    const buffer = new ArrayBuffer(16);

    expect(() => writeData(new BufferWriter(buffer), d.vec3b, d.vec3b()))
      .toThrow();
    expect(() => readData(new BufferReader(buffer), d.vec3b)).toThrow();
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec3bSchema = (_schema: d.Vec3b) => {};

    acceptsVec3bSchema(d.vec3b);
    // @ts-expect-error
    acceptsVec3bSchema(d.vec3f);
    // @ts-expect-error
    acceptsVec3bSchema(d.vec3u);
    // @ts-expect-error
    acceptsVec3bSchema(d.vec3i);
    // @ts-expect-error
    acceptsVec3bSchema(d.vec2b);
    // @ts-expect-error
    acceptsVec3bSchema(d.vec4b);
  });

  it('can be indexed into', () => {
    const vec = d.vec3b(false, true, false);
    expect(vec[0]).toBe(false);
    expect(vec[1]).toBe(true);
    expect(vec[2]).toBe(false);
  });

  it('can be modified via index', () => {
    const vec = d.vec3b(false, true, false);
    vec[0] = true;
    vec[1] = false;
    vec[2] = true;
    expect(vec).toStrictEqual(d.vec3b(true, false, true));
  });

  it('should create a vector using identity swizzle', () => {
    const vec = d.vec3b(false, true, true);
    const swizzled = vec.xyz;
    expect(swizzled.x).toBe(false);
    expect(swizzled.y).toBe(true);
    expect(swizzled.z).toBe(true);
  });

  it('should create a vector using mixed swizzle', () => {
    const vec = d.vec3b(false, true, true);
    const swizzled = vec.zyx;
    expect(swizzled.x).toBe(true);
    expect(swizzled.y).toBe(true);
    expect(swizzled.z).toBe(false);
  });

  it('should create a vector using swizzle with repeats', () => {
    const vec = d.vec3b(false, true, true);
    const swizzled = vec.yyx;
    expect(swizzled.x).toBe(true);
    expect(swizzled.y).toBe(true);
    expect(swizzled.z).toBe(false);
  });

  it('should work with for...of', () => {
    const vec = d.vec3b(true, false, true);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeBoolean();
      i++;
    }
    expect(i).toBe(3);
  });

  it('can be destructured', () => {
    const vec = d.vec3b(true, false, false);
    const [x, y, z] = vec;
    expect(x).toBe(true);
    expect(y).toBe(false);
    expect(z).toBe(false);
    expectTypeOf(x).toBeBoolean();
    expectTypeOf(y).toBeBoolean();
    expectTypeOf(z).toBeBoolean();
  });
});

describe('vec4f', () => {
  it('should span 16 bytes', () => {
    expect(sizeOf(d.vec4f)).toBe(16);
  });

  it('should create a zero 4d vector', () => {
    const zero = d.vec4f();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
    expect(zero.z).toBe(0);
    expect(zero.w).toBe(0);
  });

  it('should create a 4d vector with the given elements', () => {
    const vec = d.vec4f(1, 2, 3, 4);
    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
    expect(vec.z).toBe(3);
    expect(vec.w).toBe(4);
  });

  it('should create a 4d vector from the given scalar element', () => {
    const vec = d.vec4f(5);
    expect(vec.x).toBe(5);
    expect(vec.y).toBe(5);
    expect(vec.z).toBe(5);
    expect(vec.w).toBe(5);
  });

  it('should encode a 4d vector', () => {
    const vec = d.vec4f(1, 2, 3, 4);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec4f));

    writeData(new BufferWriter(buffer), d.vec4f, vec);
    expect(readData(new BufferReader(buffer), d.vec4f)).toStrictEqual(vec);
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

  it('can be indexed into', () => {
    const vec = d.vec4f(1, 2, 3, 4);
    expect(vec[0]).toBe(1);
    expect(vec[1]).toBe(2);
    expect(vec[2]).toBe(3);
    expect(vec[3]).toBe(4);
  });

  it('can be modified via index', () => {
    const vec = d.vec4f(1, 2, 3, 4);
    vec[0] = 5;
    vec[1] = 6;
    vec[2] = 7;
    vec[3] = 8;
    expect(vec).toStrictEqual(d.vec4f(5, 6, 7, 8));
  });

  it('should work with for...of', () => {
    const vec = d.vec4f(1, 2, 3, 4);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeNumber();
      i++;
    }
    expect(i).toBe(4);
  });

  it('can be destructured', () => {
    const vec = d.vec4f(5, 6, 7, 8);
    const [x, y, z, w] = vec;
    expect(x).toBe(5);
    expect(y).toBe(6);
    expect(z).toBe(7);
    expect(w).toBe(8);
    expectTypeOf(x).toBeNumber();
    expectTypeOf(y).toBeNumber();
    expectTypeOf(z).toBeNumber();
    expectTypeOf(w).toBeNumber();
  });
});

describe('vec2h', () => {
  it('should create a zero 2d vector', () => {
    const zero = d.vec2h();
    expect(zero.x).toBe(0);
    expect(zero.y).toBe(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const vec = d.vec2h(1, 2);
    expect(vec.x).toBe(1);
    expect(vec.y).toBe(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const vec = d.vec2h(5);
    expect(vec.x).toBe(5);
    expect(vec.y).toBe(5);
  });

  it('should encode a 2d vector', () => {
    const vec = d.vec2h(1, 2050);
    const buffer = new ArrayBuffer(sizeOf(d.vec2h));

    writeData(new BufferWriter(buffer), d.vec2h, vec);
    expect(readData(new BufferReader(buffer), d.vec2h)).toStrictEqual(vec);
  });

  it('should change unrepresentable values to the closest representable', () => {
    const vec = d.vec2h(1, 4097);

    const buffer = new ArrayBuffer(sizeOf(d.vec2h));

    writeData(new BufferWriter(buffer), d.vec2h, vec);
    expect(readData(new BufferReader(buffer), d.vec2h)).toStrictEqual(
      d.vec2h(1, 4096),
    );
  });

  it('differs in type from other vector schemas', () => {
    const acceptsVec2hSchema = (_schema: d.Vec2h) => {};

    acceptsVec2hSchema(d.vec2h);
    // @ts-expect-error
    acceptsVec2hSchema(d.vec2u);
    // @ts-expect-error
    acceptsVec2hSchema(d.vec2i);
    // @ts-expect-error
    acceptsVec2hSchema(d.vec2f);
    // @ts-expect-error
    acceptsVec2hSchema(d.vec3f);
    // @ts-expect-error
    acceptsVec2hSchema(d.vec4f);
    // @ts-expect-error
    acceptsVec2hSchema(d.vec3h);
    // @ts-expect-error
    acceptsVec2hSchema(d.vec4h);
  });

  it('can be indexed into', () => {
    const vec = d.vec2h(1, 2);
    expect(vec[0]).toBe(1);
    expect(vec[1]).toBe(2);
  });

  it('can be modified via index', () => {
    const vec = d.vec2h(1, 2);
    vec[0] = 3;
    vec[1] = 4;
    expect(vec).toStrictEqual(d.vec2h(3, 4));
  });

  it('should work with for...of', () => {
    const vec = d.vec2h(1, 2);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeNumber();
      i++;
    }
    expect(i).toBe(2);
  });

  it('can be destructured', () => {
    const vec = d.vec2h(5, 6);
    const [x, y] = vec;
    expect(x).toBe(5);
    expect(y).toBe(6);
    expectTypeOf(x).toBeNumber();
    expectTypeOf(y).toBeNumber();
  });
});

describe('v2f', () => {
  it('differs structurally from other vector instances', () => {
    expect(d.vec2f(1, 2)).toStrictEqual(d.vec2f(1, 2));
    expect(d.vec2f(1, 2)).not.toStrictEqual(d.vec2h(1, 2));
    expect(d.vec2f(1, 2)).not.toStrictEqual(d.vec2i(1, 2));
    expect(d.vec2f(1, 2)).not.toStrictEqual(d.vec2u(1, 2));
  });
});

describe('v2i', () => {
  it('differs structurally from other vector instances', () => {
    expect(d.vec2i(1, 2)).toStrictEqual(d.vec2i(1, 2));
    expect(d.vec2i(1, 2)).not.toStrictEqual(d.vec2f(1, 2));
    expect(d.vec2i(1, 2)).not.toStrictEqual(d.vec2h(1, 2));
    expect(d.vec2i(1, 2)).not.toStrictEqual(d.vec2u(1, 2));
  });

  it('should work with for...of', () => {
    const vec = d.vec2i(1, 2);
    let i = 0;
    for (const x of vec) {
      expect(x).toBe(vec[i]);
      expect(x).toBeDefined();
      expectTypeOf(x).toBeNumber();
      i++;
    }
    expect(i).toBe(2);
  });

  it('can be destructured', () => {
    const vec = d.vec2i(5, 6);
    const [x, y] = vec;
    expect(x).toBe(5);
    expect(y).toBe(6);
    expectTypeOf(x).toBeNumber();
    expectTypeOf(y).toBeNumber();
  });
});

describe('v3f', () => {
  describe('(v2f, number) constructor', () => {
    it('works in JS', () => {
      const planarPos = d.vec2f(1, 2);
      const pos = d.vec3f(planarPos, 12);
      expect(pos).toStrictEqual(d.vec3f(1, 2, 12));
    });

    it('works in TGSL', () => {
      const planarPos = d.vec2f(1, 2);

      const main = tgpu.fn([])(() => {
        const planarPosLocal = d.vec2f(1, 2);

        const one = d.vec3f(planarPos, 12); // external
        const two = d.vec3f(planarPosLocal, 12); // local variable
        const three = d.vec3f(d.vec2f(1, 2), 12); // literal
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          var planarPosLocal = vec2f(1, 2);
          var one = vec3f(1, 2, 12);
          var two = vec3f(planarPosLocal, 12f);
          var three = vec3f(1, 2, 12);
        }"
      `);
    });
  });

  it('differs structurally from other vector instances', () => {
    expect(d.vec3f(1, 2, 3)).toStrictEqual(d.vec3f(1, 2, 3));
    expect(d.vec3f(1, 2, 3)).not.toStrictEqual(d.vec3h(1, 2, 3));
    expect(d.vec3f(1, 2, 3)).not.toStrictEqual(d.vec3i(1, 2, 3));
    expect(d.vec3f(1, 2, 3)).not.toStrictEqual(d.vec3u(1, 2, 3));
  });
});

describe('v3i', () => {
  it('differs structurally from other vector instances', () => {
    expect(d.vec3i(1, 2, 3)).toStrictEqual(d.vec3i(1, 2, 3));
    expect(d.vec3i(1, 2, 3)).not.toStrictEqual(d.vec3f(1, 2, 3));
    expect(d.vec3i(1, 2, 3)).not.toStrictEqual(d.vec3h(1, 2, 3));
    expect(d.vec3i(1, 2, 3)).not.toStrictEqual(d.vec3u(1, 2, 3));
  });
});

describe('v4f', () => {
  describe('(v3f, number) constructor', () => {
    it('works in JS', () => {
      const red = d.vec3f(0.125, 0.25, 0.375);
      const redWithAlpha = d.vec4f(red, 1);
      expect(redWithAlpha).toStrictEqual(d.vec4f(0.125, 0.25, 0.375, 1));
    });

    it('works in TGSL', () => {
      const red = d.vec3f(0.125, 0.25, 0.375);

      const main = tgpu.fn([])(() => {
        const green = d.vec3f(0, 1, 0);

        const one = d.vec4f(red, 1); // external
        const two = d.vec4f(green, 1); // local variable
        const three = d.vec4f(d.vec3f(0, 0, 1), 1); // literal
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          var green = vec3f(0, 1, 0);
          var one = vec4f(0.125, 0.25, 0.375, 1);
          var two = vec4f(green, 1f);
          var three = vec4f(0, 0, 1, 1);
        }"
      `);
    });
  });

  describe('(number, v3f) constructor', () => {
    it('works in JS', () => {
      const foo = d.vec3f(0.25, 0.5, 0.75);
      const bar = d.vec4f(0.1, foo);
      expect(bar).toStrictEqual(d.vec4f(0.1, 0.25, 0.5, 0.75));
    });

    it('works in TGSL', () => {
      const foo = d.vec3f(0.25, 0.5, 0.75);

      const main = tgpu.fn([])(() => {
        const fooLocal = d.vec3f(0.25, 0.5, 0.75);

        const one = d.vec4f(0.25, foo); // external
        const two = d.vec4f(0.1, fooLocal); // local variable
        const three = d.vec4f(0.125, d.vec3f(0.25, 0.5, 0.75)); // literal
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          var fooLocal = vec3f(0.25, 0.5, 0.75);
          var one = vec4f(0.25, 0.25, 0.5, 0.75);
          var two = vec4f(0.1f, fooLocal);
          var three = vec4f(0.125, 0.25, 0.5, 0.75);
        }"
      `);
    });
  });

  describe('swizzling', () => {
    it('works in TGSL on compile-time known vectors', () => {
      const foo = tgpu.fn([], d.vec3f)(() => {
        return d.vec4f(1, 2, 3, 4).zyx;
      });

      expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
        "fn foo() -> vec3f {
          return vec3f(3, 2, 1);
        }"
      `);
    });
  });

  it('differs structurally from other vector instances', () => {
    expect(d.vec4f(1, 2, 3, 4)).toStrictEqual(d.vec4f(1, 2, 3, 4));
    expect(d.vec4f(1, 2, 3, 4)).not.toStrictEqual(d.vec4h(1, 2, 3, 4));
    expect(d.vec4f(1, 2, 3, 4)).not.toStrictEqual(d.vec4i(1, 2, 3, 4));
    expect(d.vec4f(1, 2, 3, 4)).not.toStrictEqual(d.vec4u(1, 2, 3, 4));
  });
});

describe('v4b', () => {
  describe('(v3b, bool) constructor', () => {
    it('works in JS', () => {
      const vecA = d.vec3b(true, false, true);
      const vecB = d.vec4b(vecA, false);
      expect(vecB).toStrictEqual(d.vec4b(true, false, true, false));
    });

    it('works in TGSL', () => {
      const vecExternal = d.vec3b(true, false, true);

      const main = tgpu.fn([])(() => {
        const vecLocal = d.vec3b(true, true, true);

        const one = d.vec4b(vecExternal, true); // external
        const two = d.vec4b(vecLocal, false); // local variable
        const three = d.vec4b(d.vec3b(false, false, true), true); // literal
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() {
          var vecLocal = vec3<bool>(true);
          var one = vec4<bool>(true, false, true, true);
          var two = vec4<bool>(vecLocal, false);
          var three = vec4<bool>(false, false, true, true);
        }"
      `);
    });
  });
});

describe('type predicates', () => {
  it('prunes branches', () => {
    const ceil = (input: d.v3f | d.v3i): d.v3i => {
      'use gpu';
      if (input.kind === 'vec3f') {
        return d.vec3i(std.ceil(input));
      } else {
        return d.vec3i(input);
      }
    };

    const main = () => {
      'use gpu';
      const foo = ceil(d.vec3f(1, 2, 3));
      const bar = ceil(d.vec3i(1, 2, 3));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn ceil_1(input: vec3f) -> vec3i {
        {
          return vec3i(ceil(input));
        }
      }

      fn ceil_2(input: vec3i) -> vec3i {
        {
          return input;
        }
      }

      fn main() {
        var foo = ceil_1(vec3f(1, 2, 3));
        var bar = ceil_2(vec3i(1, 2, 3));
      }"
    `);
  });
});
describe('RGBA swizzles', () => {
  describe('vec2f', () => {
    it('should access individual r and g components', () => {
      const vec = d.vec2f(1, 2);
      expect(vec.r).toBe(1);
      expect(vec.g).toBe(2);
    });

    it('should modify individual r and g components', () => {
      const vec = d.vec2f(1, 2);
      vec.r = 5;
      vec.g = 6;
      expect(vec).toStrictEqual(d.vec2f(5, 6));
    });

    it('should create a vector using identity rgba swizzle', () => {
      const vec = d.vec2f(1, 2);
      const swizzled = vec.rg;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(2);
    });

    it('should create a vector using mixed rgba swizzle', () => {
      const vec = d.vec2f(1, 2);
      const swizzled = vec.gr;
      expect(swizzled.r).toBe(2);
      expect(swizzled.g).toBe(1);
    });

    it('should create a vector using rgba swizzle with repeats', () => {
      const vec = d.vec2f(1, 2);
      const swizzled = vec.gg;
      expect(swizzled.r).toBe(2);
      expect(swizzled.g).toBe(2);
    });

    it('should create vec3 from rgba swizzle', () => {
      const vec = d.vec2f(1, 2);
      const swizzled = vec.rrg;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(1);
      expect(swizzled.b).toBe(2);
    });

    it('should create vec4 from rgba swizzle', () => {
      const vec = d.vec2f(1, 2);
      const swizzled = vec.rgrg;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(2);
      expect(swizzled.b).toBe(1);
      expect(swizzled.a).toBe(2);
    });
  });

  describe('vec3f', () => {
    it('should access individual r, g, and b components', () => {
      const vec = d.vec3f(1, 2, 3);
      expect(vec.r).toBe(1);
      expect(vec.g).toBe(2);
      expect(vec.b).toBe(3);
    });

    it('should modify individual r, g, and b components', () => {
      const vec = d.vec3f(1, 2, 3);
      vec.r = 5;
      vec.g = 6;
      vec.b = 7;
      expect(vec).toStrictEqual(d.vec3f(5, 6, 7));
    });

    it('should create a vector using identity rgba swizzle', () => {
      const vec = d.vec3f(1, 2, 3);
      const swizzled = vec.rgb;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(2);
      expect(swizzled.b).toBe(3);
    });

    it('should create a vector using mixed rgba swizzle', () => {
      const vec = d.vec3f(1, 2, 3);
      const swizzled = vec.bgr;
      expect(swizzled.r).toBe(3);
      expect(swizzled.g).toBe(2);
      expect(swizzled.b).toBe(1);
    });

    it('should create vec2 from rgba swizzle', () => {
      const vec = d.vec3f(1, 2, 3);
      const swizzled = vec.rb;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(3);
    });

    it('should create vec4 from rgba swizzle', () => {
      const vec = d.vec3f(1, 2, 3);
      const swizzled = vec.rgbr;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(2);
      expect(swizzled.b).toBe(3);
      expect(swizzled.a).toBe(1);
    });
  });

  describe('vec4f', () => {
    it('should access individual r, g, b, and a components', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      expect(vec.r).toBe(1);
      expect(vec.g).toBe(2);
      expect(vec.b).toBe(3);
      expect(vec.a).toBe(4);
    });

    it('should modify individual r, g, b, and a components', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      vec.r = 5;
      vec.g = 6;
      vec.b = 7;
      vec.a = 8;
      expect(vec).toStrictEqual(d.vec4f(5, 6, 7, 8));
    });

    it('should create a vector using identity rgba swizzle', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      const swizzled = vec.rgba;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(2);
      expect(swizzled.b).toBe(3);
      expect(swizzled.a).toBe(4);
    });

    it('should create a vector using mixed rgba swizzle', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      const swizzled = vec.abgr;
      expect(swizzled.r).toBe(4);
      expect(swizzled.g).toBe(3);
      expect(swizzled.b).toBe(2);
      expect(swizzled.a).toBe(1);
    });

    it('should create vec2 from rgba swizzle', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      const swizzled = vec.ra;
      expect(swizzled.r).toBe(1);
      expect(swizzled.g).toBe(4);
    });

    it('should create vec3 from rgba swizzle', () => {
      const vec = d.vec4f(1, 2, 3, 4);
      const swizzled = vec.gba;
      expect(swizzled.r).toBe(2);
      expect(swizzled.g).toBe(3);
      expect(swizzled.b).toBe(4);
    });
  });

  describe('vec4i', () => {
    it('should work with integer vectors', () => {
      const vec = d.vec4i(10, 20, 30, 40);
      expect(vec.r).toBe(10);
      expect(vec.g).toBe(20);
      expect(vec.b).toBe(30);
      expect(vec.a).toBe(40);

      const swizzled = vec.bgra;
      expect(swizzled.r).toBe(30);
      expect(swizzled.g).toBe(20);
      expect(swizzled.b).toBe(10);
      expect(swizzled.a).toBe(40);
    });
  });

  describe('vec3b', () => {
    it('should work with boolean vectors', () => {
      const vec = d.vec3b(true, false, true);
      expect(vec.r).toBe(true);
      expect(vec.g).toBe(false);
      expect(vec.b).toBe(true);

      const swizzled = vec.bgr;
      expect(swizzled.r).toBe(true);
      expect(swizzled.g).toBe(false);
      expect(swizzled.b).toBe(true);
    });
  });

  describe('GPU functions', () => {
    it('should work with rgba swizzles in GPU code', () => {
      const main = tgpu.fn([], d.vec3f)(() => {
        const color = d.vec4f(1, 0.5, 0.25, 1);
        return color.rgb;
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() -> vec3f {
          var color = vec4f(1, 0.5, 0.25, 1);
          return color.rgb;
        }"
      `);
    });

    it('should work with complex rgba swizzles in GPU code', () => {
      const main = tgpu.fn([], d.vec4f)(() => {
        const color = d.vec4f(1, 0.5, 0.25, 1);
        return color.bgra;
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() -> vec4f {
          var color = vec4f(1, 0.5, 0.25, 1);
          return color.bgra;
        }"
      `);
    });

    it('should work with rgba on compile-time known vectors', () => {
      const foo = tgpu.fn([], d.vec3f)(() => {
        return d.vec4f(1, 2, 3, 4).bgr;
      });

      expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
        "fn foo() -> vec3f {
          return vec3f(3, 2, 1);
        }"
      `);
    });

    it('should support individual rgba component access', () => {
      const main = tgpu.fn([], d.f32)(() => {
        const color = d.vec4f(1, 0.5, 0.25, 0.75);
        return color.a;
      });

      expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
        "fn main() -> f32 {
          var color = vec4f(1, 0.5, 0.25, 0.75);
          return color.a;
        }"
      `);
    });
  });
});
