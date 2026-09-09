import { CAPTURE, captureSnippets, simplifyType, test } from 'typegpu-testing-utility';
import { tgpu, std, d } from 'typegpu';
import { expect, vi } from 'vitest';

test('intdiv with i32', () => {
  function foo() {
    'use gpu';
    const ten = std.intdiv(101, 10);
    return std.intdiv(-(ten + 2), 5);
  }

  expect(foo()).toStrictEqual(-2);
  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo() -> i32 {
      const ten = 10i;
      return (-((ten + 2i)) / 5i);
    }"
  `);
});

test('intdiv with u32', () => {
  function foo() {
    'use gpu';
    const ten = std.intdiv(d.u32(101), d.u32(10));
    return std.intdiv(ten + 2, 5);
  }

  expect(foo()).toStrictEqual(2);
  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo() -> u32 {
      const ten = 10u;
      return ((ten + 2u) / 5u);
    }"
  `);
});

test('intdiv with u32 mixed with i32', () => {
  using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  function foo() {
    'use gpu';
    const ten = CAPTURE(std.intdiv(d.u32(101), d.i32(10)));
    return std.intdiv(ten + 2, d.u32(5));
  }

  expect(foo()).toStrictEqual(2);
  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo() -> i32 {
      const ten = 10i;
      return ((ten + 2i) / 5i);
    }"
  `);
  expect(captureSnippets(foo).map(simplifyType)).toMatchInlineSnapshot(`
    [
      {
        "dataType": "i32",
        "origin": "constant",
        "possibleSideEffects": false,
        "value": 10,
      },
    ]
  `);

  expect(warnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "⚠️ [implicit-conversion] ",
        "Implicit conversions from [
      101u: u32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
      [
        "⚠️ [implicit-conversion] ",
        "Implicit conversions from [
      5u: u32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
      [
        "⚠️ [implicit-conversion] ",
        "Implicit conversions from [
      101u: u32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
      [
        "⚠️ [implicit-conversion] ",
        "Implicit conversions from [
      5u: u32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
    ]
  `);
});

test('intdiv preserves signed runtime float operands', () => {
  using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  const foo = tgpu.fn([d.f32, d.f32], d.i32)((lhs, rhs) => std.intdiv(lhs, rhs));

  expect(foo(-5.9, 2.1)).toBe(-2);
  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo(lhs: f32, rhs: f32) -> i32 {
      return (i32(lhs) / i32(rhs));
    }"
  `);
  expect(warnSpy.mock.calls).toHaveLength(2);
});

test('intdiv coerces float arguments to integers', () => {
  using warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

  function foo() {
    'use gpu';
    return std.intdiv(d.f32(5.5), 2);
  }

  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo() -> i32 {
      return 2i;
    }"
  `);

  expect(warnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "⚠️ [implicit-conversion] ",
        "Implicit conversions from [
      5.5f: f32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
    ]
  `);
});

test('intdiv throws with vector arguments', () => {
  expect(() =>
    tgpu.resolve([
      () => {
        'use gpu';
        // @ts-expect-error
        return std.intdiv(d.vec3u(4, 5, 2), 2);
      },
    ]),
  ).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:undefined
    - fn*:<unnamed>()
    - fn:intdiv: Unsupported data types: vec3u, abstractInt. Supported types are: i32, u32, abstractInt.]
  `);

  expect(() =>
    tgpu.resolve([
      () => {
        'use gpu';
        // @ts-expect-error
        return std.intdiv(2, d.vec3i(4, 5, 2));
      },
    ]),
  ).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:undefined
    - fn*:<unnamed>()
    - fn:intdiv: Unsupported data types: abstractInt, vec3i. Supported types are: i32, u32, abstractInt.]
  `);
});
