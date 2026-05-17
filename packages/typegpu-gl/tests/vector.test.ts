import tgpu, { d } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { test } from './utils/extendedTest.ts';
import { expect } from 'vitest';

test('empty vec3f constructor', () => {
  function foo() {
    'use gpu';
    return d.vec3f();
  }

  const code = tgpu.resolve([foo], glOptions({ shaderStage: 'none' }));

  // Empty vector constructors `vecN()` are illegal in GLSL
  expect(code).toContain('vec3(0)');

  expect(code).toMatchInlineSnapshot(`
    "vec3 foo() {
      return vec3(0);
    }"
  `);
});
