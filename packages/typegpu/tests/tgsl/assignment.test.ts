import { beforeEach, expect, type MockInstance, vi } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import tgpu, { d } from '../../src/index.js';

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

  expect(warnSpy).toHaveBeenCalledExactlyOnceWith(`\
Implicit conversions from [
  a: i32,
  arg: f32
] to i32 are supported, but not recommended.
Consider using explicit conversions instead.`);
});
