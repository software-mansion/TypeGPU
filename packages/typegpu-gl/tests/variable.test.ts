import { expect } from 'vitest';
import tgpu, { d } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { test } from './utils/extendedTest.ts';

test('private variable with a scalar value', () => {
  const FOO = tgpu.privateVar(d.f32, 123.5);

  function main() {
    'use gpu';
    return FOO.$;
  }

  expect(tgpu.resolve([main], glOptions({ shaderStage: 'none' }))).toMatchInlineSnapshot(`
    "float FOO = 123.5f;

    float main() {
      return FOO;
    }"
  `);
});
