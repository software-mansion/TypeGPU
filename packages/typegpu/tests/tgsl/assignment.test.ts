import { beforeEach, expect, type MockInstance, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn');
});

it('implicitly casts right-hand side, with a warning', () => {
  const foo = tgpu.fn(
    [d.f32],
    d.i32,
  )((arg) => {
    let a = 12; // inferred to be i32
    a = arg;
    return a;
  });

  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo(arg: f32) -> i32 {
      var a = 12;
      a = i32(arg);
      return a;
    }"
  `);

  expect(warnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "⚠️ [implicit-conversion] ",
        "Implicit conversions from [
      a: i32,
      arg: f32
    ] to i32 are supported, but not recommended.
    Consider using explicit conversions instead.",
      ],
    ]
  `);
});

it('allows assignments as standalone statements', () => {
  const foo = tgpu.fn(
    [],
    d.u32,
  )(() => {
    let a = d.u32(1);
    a = 2;
    a += 3;
    a *= 4;
    a <<= 1;
    a |= 8;
    for (let i = d.u32(0); i < 10; i = i + 1) {
      a -= i;
    }
    return a;
  });

  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo() -> u32 {
      var a = 1u;
      a = 2u;
      a += 3u;
      a *= 4u;
      a <<= 1u;
      a |= 8u;
      for (var i = 0u; (i < 10u); i = (i + 1u)) {
        a -= i;
      }
      return a;
    }"
  `);
});

it('throws a readable error on a chained assignment', () => {
  const foo = () => {
    'use gpu';
    let a = d.i32(0);
    let b = d.i32(0);
    a = b = 1;
  };

  expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:foo
    - fn*:foo(): 'b = 1' is invalid because assignment is only allowed as a standalone statement.]
  `);
});

it('throws a readable error on a chained compound assignment', () => {
  const foo = () => {
    'use gpu';
    let a = d.i32(0);
    let b = d.i32(0);
    a += b -= 1;
  };

  expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:foo
    - fn*:foo(): 'b -= 1' is invalid because assignment is only allowed as a standalone statement.]
  `);
});

it('throws a readable error on an assignment used as an operand', () => {
  const foo = () => {
    'use gpu';
    let a = d.i32(0);
    const c = (a = 2) + 1;
  };

  expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:foo
    - fn*:foo(): 'a = 2' is invalid because assignment is only allowed as a standalone statement.]
  `);
});

it('throws a readable error on an assignment used as a call argument', () => {
  const bar = (x: number) => {
    'use gpu';
    return x;
  };

  const foo = () => {
    'use gpu';
    let a = d.f32(0);
    bar((a = 2));
  };

  expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:foo
    - fn*:foo(): 'a = 2' is invalid because assignment is only allowed as a standalone statement.]
  `);
});

it('throws a readable error on an assignment used as a condition', () => {
  const foo = () => {
    'use gpu';
    let a = d.i32(0);
    while ((a += 1) < 10) {
      a *= 2;
    }
  };

  expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:foo
    - fn*:foo(): 'a += 1' is invalid because assignment is only allowed as a standalone statement.]
  `);
});

it('throws a readable error on an assignment used as a return value', () => {
  const foo = tgpu.fn(
    [],
    d.i32,
  )(() => {
    let a = d.i32(0);
    return (a = 2);
  });

  expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn:foo: 'a = 2' is invalid because assignment is only allowed as a standalone statement.]
  `);
});

it('throws a readable error on an assignment used in a for loop update', () => {
  const foo = () => {
    'use gpu';
    let a = d.i32(0);
    for (let i = 0; i < 10; i = a = i + 1) {}
  };

  expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
    [Error: Resolution of the following tree failed:
    - <root>
    - fn*:foo
    - fn*:foo(): 'a = i + 1' is invalid because assignment is only allowed as a standalone statement.]
  `);
});
