import { expect, test } from 'vitest';
import { asGLSL } from './utils/asGLSL.ts';

test('functionDefinition', () => {
  const foo = () => {
    'use gpu';
    return 1 + 2;
  };

  expect(asGLSL(foo)).toMatchInlineSnapshot(`"fn foo() hello"`);
});
