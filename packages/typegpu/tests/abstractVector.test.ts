import { describe, expect, expectTypeOf, it } from 'vitest';
import { d, std, tgpu } from 'typegpu';

describe('abstract vector values', () => {
  it.each([d.vec2, d.vec3, d.vec4])('%s retains JS numbers without Array inheritance', (schema) => {
    const n = schema.componentCount;
    const create = (...args: unknown[]) =>
      Reflect.apply(schema, undefined, args) as d.v2 | d.v3 | d.v4;
    const values = [0.1, -1.75, 2 ** 40, -0].slice(0, n);
    const vector = create(...values);
    expect(vector.kind).toBe(schema.type);
    expect(Array.isArray(vector)).toBe(false);
    // oxlint-disable-next-line unicorn/no-instanceof-builtins -- test prototype compatibility separately from Array identity
    expect(vector instanceof Array).toBe(false);
    expect('map' in vector).toBe(false);
    expect(Array.from(vector)).toEqual(values);
    expect(vector.length).toBe(n);
    expect(Object.keys(vector)).toEqual(Array.from('xyzw'.slice(0, n)));
    expect(Array.from(create())).toEqual(Array.from({ length: n }, () => 0));
    expect(Array.from(create(0.1))).toEqual(Array.from({ length: n }, () => 0.1));
    expect(create(vector)).not.toBe(vector);
    expect(Array.from(create(vector))).toEqual(values);
    expect(() => create(...Array.from({ length: n + 1 }, () => 0))).toThrow();
    expect(() => create(true)).toThrow();
    expect(() => create({ length: n })).toThrow();
    expect(() => create(d.vec2b())).toThrow();
    for (let i = 0; i < n; i++) {
      vector[i] = 0.3;
      expect(Reflect.get(vector, 'xyzw'[i] as string)).toBe(0.3);
      Reflect.set(vector, 'rgba'[i] as string, -0);
      expect(vector[i]).toBe(-0);
    }
  });

  it('always constructs abstract values, including from concrete inputs', () => {
    expect(d.vec3(1, 2, 3).kind).toBe('vec3');
    expect(d.vec3(d.vec3u(1, 2, 3)).kind).toBe('vec3');
    expect(Array.from(d.vec3(d.vec2(0.1, 0.2), 0.3))).toEqual([0.1, 0.2, 0.3]);
    expect(Array.from(d.vec4(0.1, d.vec2(0.2, 0.3), 0.4))).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(Array.from(d.vec4(d.vec2(1, 2), d.vec2f(3, 4)))).toEqual([1, 2, 3, 4]);
  });

  it('swizzles to fresh abstract vectors', () => {
    const v = d.vec4(0.1, 0.2, 0.3, 0.4);
    expect(Array.from(v.wzyx)).toEqual([0.4, 0.3, 0.2, 0.1]);
    expect(v.rgb.kind).toBe('vec3');
    expect(Array.from(v.xx)).toEqual([0.1, 0.1]);
    expect(Array.isArray(v.xy)).toBe(false);
    const copy = v.xy;
    copy.x = 42;
    expect(v.x).toBe(0.1);
  });

  it('supports arithmetic without narrowing intermediate results', () => {
    const v = d.vec3(0.1, 0.2, 0.3);
    expect(Array.from(std.add(v, v))).toEqual([0.2, 0.4, 0.6]);
    expect(std.add(v, v).kind).toBe('vec3');
    expect(v.mul(2).x).toBe(0.2);
    expect(std.sin(v).x).toBe(Math.sin(0.1));
    expect(std.dot(d.vec3(1, 2, 3), d.vec3(4, 5, 6))).toBe(32);
    expect(std.length(d.vec2(3, 4))).toBe(5);
    expect(Array.from(std.cross(d.vec3(1, 0, 0), d.vec3(0, 1, 0)))).toEqual([0, 0, 1]);
    expect(Array.from(std.normalize(d.vec3(0, 3, 4)))).toEqual([0, 0.6, 0.8]);
    expect(std.copy(v)).toEqual(v);
    expect(std.copy(v)).not.toBe(v);
  });

  it('concretizes explicitly with the existing constructors', () => {
    const v = d.vec3(0.1, -1.75, 2.5);
    expect(Array.from(d.vec3f(v))).toEqual(Array.from(v).map(Math.fround));
    expect(Array.from(d.vec3i(v))).toEqual([0, -1, 2]);
    expect(Array.from(d.vec3u(v))).toEqual([0, 0, 2]);
    expect(Array.from(d.vec3h(v))).toEqual(Array.from(v).map((v) => d.f16(v)));
    expectTypeOf(v).toEqualTypeOf<d.v3>();
    expectTypeOf(v).not.toExtend<d.v3f>();
    expectTypeOf(v).not.toExtend<unknown[]>();
    expectTypeOf(d.vec3f(v)).toEqualTypeOf<d.v3f>();
    expect(Array.isArray(d.vec3f(v))).toBe(true);
  });
});

describe('abstract vector compilation boundaries', () => {
  it('folds abstract construction and arithmetic before explicit concretization', () => {
    const main = () => {
      'use gpu';
      const value = d.vec3f(std.add(d.vec3(1, 2, 3), d.vec3(4, 5, 6)));
      return value;
    };
    const code = tgpu.resolve([main]);
    expect(code).toContain('vec3f(5, 7, 9)');
    expect(code).not.toMatch(/\bvec[234]\s*(?:\(|<)/);
  });

  it('accepts captured abstract vectors and compile-time callbacks', () => {
    const captured = d.vec3(1, 2, 3);
    const twice = tgpu.comptime(() => captured.mul(2));
    const main = () => {
      'use gpu';
      return d.vec3f(twice());
    };
    expect(tgpu.resolve([main])).toContain('vec3f(2, 4, 6)');
  });

  it('allows concrete construction with abstract and runtime components', () => {
    const main = (x: number) => {
      'use gpu';
      return d.vec3f(d.vec2(1, 2), x);
    };
    const entry = tgpu.fn([d.f32], d.vec3f)(main);
    expect(tgpu.resolve([entry])).toContain('vec3f(1, 2, x)');
  });

  it('supports compile-time swizzles and scalar extraction', () => {
    const main = () => {
      'use gpu';
      const a = d.vec3(1, 2, 3).z;
      const b = d.vec3(1, 2, 3)[1];
      return d.vec2f(d.vec3(1, 2, 3).yx).mul(a + b);
    };
    const code = tgpu.resolve([main]);
    expect(code).not.toMatch(/\bvec[234]\s*(?:\(|<)/);
    expect(code).toContain('vec2f');
  });

  it('rejects abstract const declarations in shader code', () => {
    const main = () => {
      'use gpu';
      const value = d.vec3(1, 2, 3);
      return value.x;
    };
    expect(() => tgpu.resolve([main])).toThrow(/abstract vector.*compile time/);
  });

  it('rejects abstract let declarations in shader code', () => {
    const main = () => {
      'use gpu';
      let value = d.vec3(1, 2, 3);
      value = d.vec3(4, 5, 6);
      return value.x;
    };
    expect(() => tgpu.resolve([main])).toThrow(/abstract vector.*compile time/);
  });

  it('rejects captured abstract vectors at shellless argument boundaries', () => {
    const captured = d.vec3(1, 2, 3);
    const helper = (v: d.v3) => {
      'use gpu';
      return v.x;
    };
    const main = () => {
      'use gpu';
      return helper(captured);
    };
    expect(() => tgpu.resolve([main])).toThrow(/abstract vector.*compile time/);
  });

  it('accepts an explicitly concretized shellless argument', () => {
    const helper = (v: d.v3f) => {
      'use gpu';
      return v.x;
    };
    const main = () => {
      'use gpu';
      return helper(d.vec3f(d.vec3(1, 2, 3)));
    };
    expect(tgpu.resolve([main])).toContain('helper(vec3f(1, 2, 3))');
  });

  it('rejects runtime inputs even when the result is explicitly concretized', () => {
    const main = tgpu.fn([d.f32], d.vec3f)((x) => d.vec3f(d.vec3(x, 1, 2)));
    expect(() => tgpu.resolve([main])).toThrow(/abstract vector.*compile time/);
  });

  it('rejects abstract returns and direct schema resolution', () => {
    const main = () => {
      'use gpu';
      return d.vec3(1, 2, 3);
    };
    expect(() => tgpu.resolve([main])).toThrow(/abstract vector.*compile time/);
    expect(() => tgpu.resolve([d.vec3])).toThrow(/abstract vector.*compile time/);
  });

  it('rejects implicit conversion at assignments and concrete function arguments', () => {
    const assign = () => {
      'use gpu';
      let value = d.vec3f();
      // @ts-expect-error Abstract vectors require explicit conversion.
      value = d.vec3(1, 2, 3);
      return value;
    };
    const helper = tgpu.fn([d.vec3f], d.f32)((v) => v.x);
    const call = () => {
      'use gpu';
      // @ts-expect-error Abstract vectors require explicit conversion.
      return helper(d.vec3(1, 2, 3));
    };
    expect(() => tgpu.resolve([assign])).toThrow();
    expect(() => tgpu.resolve([call])).toThrow();
  });

  it('has no memory layout, including inside arrays and structs', () => {
    expect(() => d.sizeOf(d.vec3)).toThrow();
    expect(() => d.sizeOf(d.arrayOf(d.vec3, 2))).toThrow();
    expect(() => d.sizeOf(d.struct({ position: d.vec3 }))).toThrow();
  });

  it('folds abstract vector math without emitting constructors', () => {
    const main = () => {
      'use gpu';
      return d.vec3f(std.normalize(std.cross(d.vec3(1, 0, 0), d.vec3(0, 1, 0))));
    };
    const code = tgpu.resolve([main]);
    expect(code).toContain('vec3f(0, 0, 1)');
    expect(code).not.toMatch(/\bvec[234]\s*(?:\(|<)/);
  });

  it('rejects runtime indexing of an abstract vector', () => {
    const main = tgpu.fn([d.u32], d.f32)((i) => d.vec3(1, 2, 3)[i] as number);
    expect(() => tgpu.resolve([main])).toThrow(/abstract vector.*compile time/);
  });
});
