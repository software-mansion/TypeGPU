import { expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { test } from './utils/extendedTest.ts';

test('private variable with a scalar value', () => {
  const FOO = tgpu.privateVar(d.f32, 123.5);

  function main() {
    'use gpu';
    return FOO.$;
  }

  expect(tgpu.resolve([main], glOptions({ shaderStage: 'none' }))).toMatchInlineSnapshot(`
    "float FOO = 123.5;

    float main() {
      return FOO;
    }"
  `);
});

test('private variable with an array value', () => {
  const FOO = tgpu.privateVar(d.arrayOf(d.f32, 2), [123.5, 432.6]);

  function main() {
    'use gpu';
    return FOO.$[0];
  }

  expect(tgpu.resolve([main], glOptions({ shaderStage: 'none' }))).toMatchInlineSnapshot(`
    "float FOO[2] = float[2](123.5, 432.6);

    float main() {
      return FOO[0];
    }"
  `);
});
