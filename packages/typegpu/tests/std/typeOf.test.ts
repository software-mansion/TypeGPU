import { test } from 'typegpu-testing-utility';
import { d, std, tgpu } from 'typegpu';
import { describe, expect } from 'vitest';

test('std.typeOf of a scalar argument', () => {
  function foo(a: number, b: number, c: boolean) {
    'use gpu';
    let result = true;
    // All of these should be true
    result = result || std.typeOf(a) === d.f32;
    result = result || std.typeOf(b) === d.i32;
    result = result || std.typeOf(c) === d.bool;
    return result;
  }

  function main() {
    'use gpu';
    foo(1.5, 1, true);
  }

  const code = tgpu.resolve([main]);

  expect(code).toMatchNTimes(/result = \(result \|\| true\)/g, 3);

  expect(code).toMatchInlineSnapshot(`
    "fn foo(a: f32, b: i32, c: bool) -> bool {
      var result = true;
      result = (result || true);
      result = (result || true);
      result = (result || true);
      return result;
    }

    fn main() {
      foo(1.5f, 1i, true);
    }"
  `);
});

test('std.typeOf to assert argument types', () => {
  const assertType = tgpu.comptime((received: d.AnyData | undefined, expected: d.AnyData) => {
    if (received !== expected) {
      throw new Error(`Expected type ${String(expected)}, got ${String(received)}`);
    }
  });

  function foo(a: number) {
    'use gpu';
    assertType(std.typeOf(a), d.f32);
    return a * 2;
  }

  function good() {
    'use gpu';
    return foo(1.5);
  }

  function bad() {
    'use gpu';
    return foo(1);
  }

  expect(() => tgpu.resolve([good])).not.toThrow();
  expect(() => tgpu.resolve([bad])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:bad
    - fn*:bad()
    - fn*:foo(i32)
    - fn:assertType: Expected type f32, got i32]
  `);
});

test('std.typeOf throws at comptime', () => {
  expect(() => std.typeOf(true)).toThrowErrorMatchingInlineSnapshot(
    `[Error: std.typeOf() cannot be called in JS, it can only be used in the GPU context. You can use std.isBeingTranspiled() to branch off and provide a fallback.]`,
  );

  const getType = tgpu.comptime((value: number) => std.typeOf(value));

  function main() {
    'use gpu';
    getType(1.5);
  }

  expect(() => tgpu.resolve([main])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:main
    - fn*:main()
    - fn:getType: std.typeOf() cannot be called in JS, it can only be used in the GPU context. You can use std.isBeingTranspiled() to branch off and provide a fallback.]
  `);
});

test('std.typeOf of a constant', () => {
  const fn = () => {
    'use gpu';
    return std.typeOf(0) === d.abstractInt;
  };

  const code = tgpu.resolve([fn]);
  expect(code).toMatchInlineSnapshot(`
    "fn fn_1() -> bool {
      return true;
    }"
  `);
  expect(code).toContain('true');
});

test('std.typeOf of a struct', () => {
  const Schema = d.struct({ prop: d.u32 });
  const fn = () => {
    'use gpu';
    return std.typeOf(Schema()) === Schema;
  };

  const code = tgpu.resolve([fn]);
  expect(code).toMatchInlineSnapshot(`
    "struct Schema {
      prop: u32,
    }

    fn fn_1() -> bool {
      return true;
    }"
  `);
  expect(code).toContain('true');
});

test('std.typeOf of UnknownData', () => {
  const fn = () => {
    'use gpu';
    const t1 = std.typeOf('unknown') === undefined;
    const t2 = std.typeOf(fn) === undefined;
    const t3 = std.typeOf(d.vec2f) === undefined;
    const t4 = std.typeOf(d.vec2f().mul) === undefined;
    return t1 && t2 && t3 && t4;
  };

  const code = tgpu.resolve([fn]);
  expect(code).toMatchInlineSnapshot(`
    "fn fn_1() -> bool {
      const t1 = true;
      const t2 = true;
      const t3 = true;
      const t4 = true;
      return (((t1 && t2) && t3) && t4);
    }"
  `);
  expect(code).not.toContain('false');
});

test('std.typeOf assigned to a variable throws', () => {
  const fn = () => {
    'use gpu';
    const t = std.typeOf(0);
    return t;
  };

  expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:fn
    - fn*:fn(): 'const t = std.typeOf(0)' is invalid, cannot determine WGSL type of 'std.typeOf(0)'
    -----
    - Try using or defining a schema that matches your desired value the most, and wrap the value with it: 'const t = Schema(std.typeOf(0))'
    -----]
  `);
});

test('std.typeOf of an AutoStruct is undefined', ({ root }) => {
  const types: unknown[] = [];
  const capture = tgpu.comptime((type: d.AnyData | undefined) => {
    types.push(type);
  });

  const pipeline = root.createRenderPipeline({
    vertex: () => {
      'use gpu';
      return { $position: d.vec4f(), uv: d.vec2f() };
    },
    fragment: (input) => {
      'use gpu';
      capture(std.typeOf(input));
      return d.vec4f(input.uv, 0, 1);
    },
  });

  tgpu.resolve([pipeline]);
  expect(types).toStrictEqual([undefined]);
});

test('std.typeOf of an entry function input is undefined', () => {
  const types: unknown[] = [];
  const capture = tgpu.comptime((type: d.AnyData | undefined) => {
    types.push(type);
  });

  const fragment = tgpu.fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    'use gpu';
    capture(std.typeOf(input));
    return d.vec4f(input.uv, 0, 1);
  });

  tgpu.resolve([fragment]);
  expect(types).toStrictEqual([undefined]);
});

describe('std.typeOf of an abstruct', () => {
  test('returns the result struct of std.frexp', () => {
    const types: unknown[] = [];
    const capture = tgpu.comptime((type: d.AnyData | undefined) => {
      types.push(type);
    });

    const fn = (value: number) => {
      'use gpu';
      const result = std.frexp(value);
      capture(std.typeOf(result));
      capture(std.typeOf(std.frexp(d.vec3f(value))));
      capture(std.typeOf(std.frexp(1.5)));
    };

    const main = () => {
      'use gpu';
      fn(1.5);
    };

    tgpu.resolve([main]);

    const [f32Result, vec3fResult, abstractResult] = types as d.AnyWgslStruct[];
    expect(f32Result?.type).toBe('struct');
    expect(f32Result?.propTypes).toStrictEqual({ fract: d.f32, exp: d.i32 });
    expect(vec3fResult?.type).toBe('struct');
    expect(vec3fResult?.propTypes).toStrictEqual({ fract: d.vec3f, exp: d.vec3i });
    expect(abstractResult?.type).toBe('struct');
    expect(abstractResult?.propTypes).toStrictEqual({
      fract: d.abstractFloat,
      exp: d.abstractInt,
    });
  });

  test('returns the result struct of std.modf', () => {
    const types: unknown[] = [];
    const capture = tgpu.comptime((type: d.AnyData | undefined) => {
      types.push(type);
    });

    const fn = () => {
      'use gpu';
      capture(std.typeOf(std.modf(d.f32(1.5))));
      capture(std.typeOf(std.modf(d.vec2h(1.5))));
    };

    tgpu.resolve([fn]);

    const [f32Result, vec2hResult] = types as d.AnyWgslStruct[];
    expect(f32Result?.propTypes).toStrictEqual({ fract: d.f32, whole: d.f32 });
    expect(vec2hResult?.propTypes).toStrictEqual({ fract: d.vec2h, whole: d.vec2h });
  });

  test('returns the result struct of std.atomicCompareExchangeWeak', ({ root }) => {
    const types: unknown[] = [];
    const capture = tgpu.comptime((type: d.AnyData | undefined) => {
      types.push(type);
    });

    const counter = root.createMutable(d.atomic(d.u32));

    const fn = () => {
      'use gpu';
      capture(std.typeOf(std.atomicCompareExchangeWeak(counter.$, 0, 1)));
    };

    tgpu.resolve([fn]);

    const [result] = types as d.AnyWgslStruct[];
    expect(result?.type).toBe('struct');
    expect(result?.propTypes).toStrictEqual({ old_value: d.u32, exchanged: d.bool });
  });

  test('can be compared at comptime', () => {
    const fn = (a: number, b: number) => {
      'use gpu';
      const same = std.typeOf(std.frexp(a)) === std.typeOf(std.frexp(b));
      const different = std.typeOf(std.frexp(a)) === std.typeOf(std.modf(a));
      return same && !different;
    };

    const main = () => {
      'use gpu';
      fn(1.5, 2.5);
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn fn_1(a: f32, b: f32) -> bool {
        const same = true;
        const different = false;
        return (same && !(different));
      }

      fn main() {
        fn_1(1.5f, 2.5f);
      }"
    `);
  });

  test('of a field access returns the field type', () => {
    const fn = (value: number) => {
      'use gpu';
      const result = std.frexp(value);
      const t1 = std.typeOf(result.fract) === d.f32;
      const t2 = std.typeOf(result.exp) === d.i32;
      return t1 && t2;
    };

    const main = () => {
      'use gpu';
      fn(1.5);
    };

    const code = tgpu.resolve([main]);
    expect(code).toMatchInlineSnapshot(`
      "fn fn_1(value: f32) -> bool {
        let result = frexp(value);
        const t1 = true;
        const t2 = true;
        return (t1 && t2);
      }

      fn main() {
        fn_1(1.5f);
      }"
    `);
    expect(code).not.toContain('false');
  });

  test('does not emit a struct declaration', () => {
    const fn = (value: number) => {
      'use gpu';
      return std.typeOf(std.frexp(value)) === std.typeOf(std.frexp(value));
    };

    const main = () => {
      'use gpu';
      fn(1.5);
    };

    expect(tgpu.resolve([main])).not.toContain('struct');
  });
});
