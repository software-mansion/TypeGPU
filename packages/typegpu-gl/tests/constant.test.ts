import { expect } from 'vitest';
import tgpu, { d } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { test } from './utils/extendedTest.ts';

test('constant with a scalar value', () => {
  const FOO = tgpu.const(d.f32, 123.5);

  function main() {
    'use gpu';
    return FOO.$;
  }

  expect(tgpu.resolve([main], glOptions({ shaderStage: 'none' }))).toMatchInlineSnapshot(`
    "const float FOO = 123.5f;

    float main() {
      return FOO;
    }"
  `);
});

// TODO: Emit a proper array initialization
test('constant with an array value', () => {
  const FOO = tgpu.const(d.arrayOf(d.f32), [0.5, 0.2, 1.6]);

  function main() {
    'use gpu';
    const arr = FOO.$;
    return arr[0];
  }

  expect(tgpu.resolve([main], glOptions({ shaderStage: 'none' }))).toMatchInlineSnapshot(`
    "const float FOO[] = array<float, 3>(0.5f, 0.2f, 1.6f);

    float main() {
      array<float, 3> arr = FOO;
      return arr[0i];
    }"
  `);
});
