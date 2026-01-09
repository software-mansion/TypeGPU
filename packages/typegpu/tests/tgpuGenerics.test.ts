import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

describe('TgpuGenericFn - shellless callback wrapper', () => {
  it('generates only one definition when both original and wrapped function are used', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 0);

    const getDouble = () => {
      'use gpu';
      return countAccess.$ * 2;
    };

    const getDouble4 = tgpu.fn(getDouble);

    const main = () => {
      'use gpu';
      const original = getDouble();
      const wrapped = getDouble4();
      return original + wrapped;
    };

    // Should generate only one function definition for getDouble
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 0f * 2f;
      }

      fn main() -> f32 {
        let original = getDouble();
        let wrapped = getDouble();
        return original + wrapped ;
      }"
    `);
  });
});
