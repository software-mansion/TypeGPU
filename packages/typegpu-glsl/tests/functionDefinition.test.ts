import * as d from 'typegpu/data';
import { expect, test } from 'vitest';
import { asGLSL } from './utils/asGLSL.ts';

test('no args, f32 return', () => {
  const foo = () => {
    'use gpu';
    return d.f32(1 + 2);
  };

  expect(asGLSL(foo)).toMatchInlineSnapshot(`
    "float foo() {
      return 3f;
    }"
  `);
});

test('no args, void return', () => {
  const foo = () => {
    'use gpu';
    const a = 1 + 2;
  };

  expect(asGLSL(foo)).toMatchInlineSnapshot(`
    "void foo() {
      const a = 3;
    }"
  `);
});

test('primitive args, f32 return', () => {
  const foo = (a: number, b: number) => {
    'use gpu';
    return d.f32(a + b + 2);
  };

  const bar = () => {
    'use gpu';
    foo(1, 2);
  };

  expect(asGLSL(bar)).toMatchInlineSnapshot(`
    "float foo(int a, int b) {
      return f32(((a + b) + 2i));
    }

    void bar() {
      foo(1i, 2i);
    }"
  `);
});
