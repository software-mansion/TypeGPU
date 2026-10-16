import { test } from 'typegpu-testing-utility';
import { d, std, tgpu } from 'typegpu';
import { expect } from 'vitest';
import { abstractInt } from 'typegpu/~internal';

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

test('std.typeof of a constant', () => {
  const fn = () => {
    'use gpu';
    return std.typeOf(0) === abstractInt;
  };

  const code = tgpu.resolve([fn]);
  expect(code).toMatchInlineSnapshot(`
    "fn fn_1() -> bool {
      return true;
    }"
  `);
  expect(code).toContain('true');
});

test('std.typeof of a struct', () => {
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

test('std.typeof of UnknownData', () => {
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

test('std.typeof assigned to a variable throws', () => {
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
