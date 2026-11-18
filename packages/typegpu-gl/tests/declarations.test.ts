import { expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { glOptions } from '@typegpu/gl';
import { test } from './utils/extendedTest.ts';

test('declarations report the identifier they declare', () => {
  const Wave = d.struct({ amplitude: d.f32 });
  const SCALE = tgpu.const(d.f32, 2);
  const offset = tgpu.privateVar(d.f32);

  const shade = (wave: d.Infer<typeof Wave>) => {
    'use gpu';
    return wave.amplitude * SCALE.$ + offset.$;
  };

  function main() {
    'use gpu';
    return shade(Wave({ amplitude: 1 }));
  }

  const { declarations } = tgpu.resolveWithContext([main], glOptions());

  expect(declarations.map((declaration) => declaration.name)).toStrictEqual([
    'Wave',
    'SCALE',
    'offset',
    'shade',
    'main',
  ]);
});
