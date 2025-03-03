import { parse } from 'tgpu-wgsl-parser';
import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import * as d from '../src/data';
import { readData, writeData } from '../src/data/dataIO';
import { sizeOf } from '../src/data/sizeOf';
import { parseResolved } from './utils/parseResolved';

describe('vec2f', () => {
  it('should span 8 bytes', () => {
    expect(sizeOf(d.vec2f)).toEqual(8);
  });

  it('should create a zero 2d vector', () => {
    const zero = d.vec2f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const vec = d.vec2f(1, 2);
    expect(vec.x).toEqual(1);
    expect(vec.y).toEqual(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const vec = d.vec2f(5);
    expect(vec.x).toEqual(5);
    expect(vec.y).toEqual(5);
  });

  it('should encode a 2d vector', () => {
    const vec = d.vec2f(1, 2);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec2f));

    writeData(new BufferWriter(buffer), d.vec2f, vec);
    expect(readData(new BufferReader(buffer), d.vec2f)).toEqual(vec);
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
    expect(vec[0]).toEqual(1);
    expect(vec[1]).toEqual(2);
  });

  it('can be modified via index', () => {
    const vec = d.vec2f(1, 2);
    vec[0] = 3;
    vec[1] = 4;
    expect(vec).toEqual(d.vec2f(3, 4));
  });
});

describe('vec2i', () => {
  it('should span 8 bytes', () => {
    expect(sizeOf(d.vec2i)).toEqual(8);
  });

  it('should create a zero 2d vector', () => {
    const zero = d.vec2i();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const vec = d.vec2i(1, 2);
    expect(vec.x).toEqual(1);
    expect(vec.y).toEqual(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const vec = d.vec2i(5);
    expect(vec.x).toEqual(5);
    expect(vec.y).toEqual(5);
  });

  it('should encode a 2d vector', () => {
    const vec = d.vec2i(1, 2);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec2i));

    writeData(new BufferWriter(buffer), d.vec2i, vec);
    expect(readData(new BufferReader(buffer), d.vec2i)).toEqual(vec);
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
    expect(vec[0]).toEqual(1);
    expect(vec[1]).toEqual(2);
  });

  it('can be modified via index', () => {
    const vec = d.vec2i(1, 2);
    vec[0] = 3;
    vec[1] = 4;
    expect(vec).toEqual(d.vec2i(3, 4));
  });
});

describe('vec3f', () => {
  it('should span 12 bytes', () => {
    expect(sizeOf(d.vec3f)).toEqual(12);
  });

  it('should create a zero 3d vector', () => {
    const zero = d.vec3f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
    expect(zero.z).toEqual(0);
  });

  it('should create a 3d vector with the given elements', () => {
    const vec = d.vec3f(1, 2, 3);
    expect(vec.x).toEqual(1);
    expect(vec.y).toEqual(2);
    expect(vec.z).toEqual(3);
  });

  it('should create a 3d vector from the given scalar element', () => {
    const vec = d.vec3f(5);
    expect(vec.x).toEqual(5);
    expect(vec.y).toEqual(5);
    expect(vec.z).toEqual(5);
  });

  it('should encode a 3d vector', () => {
    const vec = d.vec3f(1, 2, 3);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec3f));

    writeData(new BufferWriter(buffer), d.vec3f, vec);
    expect(readData(new BufferReader(buffer), d.vec3f)).toEqual(vec);
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
    expect(vec[0]).toEqual(1);
    expect(vec[1]).toEqual(2);
    expect(vec[2]).toEqual(3);
  });

  it('can be modified via index', () => {
    const vec = d.vec3f(1, 2, 3);
    vec[0] = 4;
    vec[1] = 5;
    vec[2] = 6;
    expect(vec).toEqual(d.vec3f(4, 5, 6));
  });
});

describe('vec3i', () => {
  it('should span 12 bytes', () => {
    expect(sizeOf(d.vec3i)).toEqual(12);
  });

  it('should create a zero 3d vector', () => {
    const zero = d.vec3i();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
    expect(zero.z).toEqual(0);
  });

  it('should create a 3d vector with the given elements', () => {
    const vec = d.vec3i(1, 2, 3);
    expect(vec.x).toEqual(1);
    expect(vec.y).toEqual(2);
    expect(vec.z).toEqual(3);
  });

  it('should create a 3d vector from the given scalar element', () => {
    const vec = d.vec3i(5);
    expect(vec.x).toEqual(5);
    expect(vec.y).toEqual(5);
    expect(vec.z).toEqual(5);
  });

  it('should encode a 3d vector', () => {
    const vec = d.vec3i(1, 2, 3);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec3i));

    writeData(new BufferWriter(buffer), d.vec3i, vec);
    expect(readData(new BufferReader(buffer), d.vec3i)).toEqual(vec);
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
    expect(vec[0]).toEqual(1);
    expect(vec[1]).toEqual(2);
    expect(vec[2]).toEqual(3);
  });

  it('can be modified via index', () => {
    const vec = d.vec3i(1, 2, 3);
    vec[0] = 4;
    vec[1] = 5;
    vec[2] = 6;
    expect(vec).toEqual(d.vec3i(4, 5, 6));
  });
});

describe('vec4f', () => {
  it('should span 16 bytes', () => {
    expect(sizeOf(d.vec4f)).toEqual(16);
  });

  it('should create a zero 4d vector', () => {
    const zero = d.vec4f();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
    expect(zero.z).toEqual(0);
    expect(zero.w).toEqual(0);
  });

  it('should create a 4d vector with the given elements', () => {
    const vec = d.vec4f(1, 2, 3, 4);
    expect(vec.x).toEqual(1);
    expect(vec.y).toEqual(2);
    expect(vec.z).toEqual(3);
    expect(vec.w).toEqual(4);
  });

  it('should create a 4d vector from the given scalar element', () => {
    const vec = d.vec4f(5);
    expect(vec.x).toEqual(5);
    expect(vec.y).toEqual(5);
    expect(vec.z).toEqual(5);
    expect(vec.w).toEqual(5);
  });

  it('should encode a 4d vector', () => {
    const vec = d.vec4f(1, 2, 3, 4);

    const buffer = new ArrayBuffer(d.sizeOf(d.vec4f));

    writeData(new BufferWriter(buffer), d.vec4f, vec);
    expect(readData(new BufferReader(buffer), d.vec4f)).toEqual(vec);
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
    expect(vec[0]).toEqual(1);
    expect(vec[1]).toEqual(2);
    expect(vec[2]).toEqual(3);
    expect(vec[3]).toEqual(4);
  });

  it('can be modified via index', () => {
    const vec = d.vec4f(1, 2, 3, 4);
    vec[0] = 5;
    vec[1] = 6;
    vec[2] = 7;
    vec[3] = 8;
    expect(vec).toEqual(d.vec4f(5, 6, 7, 8));
  });
});

describe('vec2h', () => {
  it('should create a zero 2d vector', () => {
    const zero = d.vec2h();
    expect(zero.x).toEqual(0);
    expect(zero.y).toEqual(0);
  });

  it('should create a 2d vector with the given elements', () => {
    const vec = d.vec2h(1, 2);
    expect(vec.x).toEqual(1);
    expect(vec.y).toEqual(2);
  });

  it('should create a 2d vector from the given scalar element', () => {
    const vec = d.vec2h(5);
    expect(vec.x).toEqual(5);
    expect(vec.y).toEqual(5);
  });

  it('should encode a 2d vector', () => {
    const vec = d.vec2h(1, 2050);
    const buffer = new ArrayBuffer(sizeOf(d.vec2h));

    writeData(new BufferWriter(buffer), d.vec2h, vec);
    expect(readData(new BufferReader(buffer), d.vec2h)).toEqual(vec);
  });

  it('should change unrepresentable values to the closest representable', () => {
    const vec = d.vec2h(1, 4097);

    const buffer = new ArrayBuffer(sizeOf(d.vec2h));

    writeData(new BufferWriter(buffer), d.vec2h, vec);
    expect(readData(new BufferReader(buffer), d.vec2h)).toEqual(
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
    expect(vec[0]).toEqual(1);
    expect(vec[1]).toEqual(2);
  });

  it('can be modified via index', () => {
    const vec = d.vec2h(1, 2);
    vec[0] = 3;
    vec[1] = 4;
    expect(vec).toEqual(d.vec2h(3, 4));
  });
});

describe('v3f', () => {
  it('can be spread', () => {
    const red = d.vec3f(0.9, 0.2, 0.1);
    const result = d.vec4f(...red.t, 1);
    expect(result).toEqual(d.vec4f(0.9, 0.2, 0.1, 1));
  });

  it('can be spread in TGSL', () => {
    const red = d.vec3f(0.9, 0.2, 0.1);

    const main = tgpu['~unstable']
      .fn([], d.vec4f)
      .does(() => d.vec4f(...red.t, 1))
      .$name('main');

    expect(parseResolved({ main })).toEqual(
      parse(`
      fn main() -> vec4f {
        return vec4f(vec3f(0.9, 0.2, 0.1), 1);
      }
    `),
    );
  });

  it('can be spread in TGSL (2)', () => {
    const main = tgpu['~unstable']
      .fn([], d.vec4f)
      .does(() => {
        const red = d.vec3f(0.9, 0.2, 0.1);
        return d.vec4f(...red.t, 1);
      })
      .$name('main');

    expect(parseResolved({ main })).toEqual(
      parse(`
      fn main() -> vec4f {
        var red = vec3f(0.9, 0.2, 0.1);
        return vec4f(red, 1);
      }
    `),
    );
  });
});
