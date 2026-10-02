import { beforeEach, expect, type MockInstance, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

let warnSpy: MockInstance<typeof console.warn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn');
  warnSpy.mockClear();
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
        "⚠️ [precision-loss] ",
        "'a = arg' assigns a floating-point value to 'a', which is of type i32. The fractional part is dropped on the GPU, while plain JavaScript would keep it.
    -----
    - If 'a' should hold fractions, declare it as a float, e.g. 'let a = d.f32(...)'.
    - If dropping the fraction is intended, make it explicit, e.g. 'a = d.i32(...)'.
    -----",
      ],
    ]
  `);
});

it('warns when dividing an integer variable drops the fraction', () => {
  const foo = tgpu.fn(
    [],
    d.i32,
  )(() => {
    let a = 7; // inferred to be i32
    a = a / 2; // 3.5 in JS, 3 on the GPU
    return a;
  });

  expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
    "fn foo() -> i32 {
      var a = 7;
      a = i32((f32(a) / 2f));
      return a;
    }"
  `);
  expect(warnSpy.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "⚠️ [precision-loss] ",
        "'a = a / 2' assigns a floating-point value to 'a', which is of type i32. The fractional part is dropped on the GPU, while plain JavaScript would keep it.
    -----
    - If 'a' should hold fractions, declare it as a float, e.g. 'let a = d.f32(...)'.
    - If dropping the fraction is intended, make it explicit, e.g. 'a = d.i32(...)'.
    -----",
      ],
    ]
  `);
});

it('warns for compound assignments to integer vectors', () => {
  const foo = tgpu.fn(
    [d.vec2f],
    d.vec2i,
  )((v) => {
    let a = d.vec2i(1, 2);
    // @ts-expect-error -- TypeScript catches this, but plain JavaScript does not
    a += v;
    return a;
  });

  tgpu.resolve([foo]);
  expect(warnSpy.mock.calls.map((call) => call[0])).toStrictEqual(['⚠️ [precision-loss] ']);
});

it('does not warn about dropped fractions for float values without a fraction', () => {
  const foo = tgpu.fn(
    [],
    d.i32,
  )(() => {
    let a = 7;
    a = d.f32(2);
    return a;
  });

  tgpu.resolve([foo]);
  expect(warnSpy.mock.calls.some((call) => call[0] === '⚠️ [precision-loss] ')).toBe(false);
});
