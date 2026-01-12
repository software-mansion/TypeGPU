import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

describe('TgpuGenericFn - shellless callback wrapper', () => {
  it('generates only one definition when both original and wrapped function are used', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 2);

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

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 4f;
      }

      fn main() -> f32 {
        let original = getDouble();
        let wrapped = getDouble();
        return (original + wrapped);
      }"
    `);
  });

  it('works when only the wrapped function is used', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 0);

    const getDouble = () => {
      'use gpu';
      return countAccess.$ * 2;
    };

    const getDouble4 = tgpu.fn(getDouble);

    const main = () => {
      'use gpu';
      return getDouble4();
    };

    const wgsl = tgpu.resolve([main]);
    expect(wgsl).toContain('fn getDouble()');
    expect(wgsl).toContain('fn main()');
    expect(wgsl).toContain('return getDouble();');
  });

  it('keeps a single definition when wrapped is called multiple times', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 0);

    const getDouble = () => {
      'use gpu';
      return countAccess.$ * 2;
    };

    const getDouble4 = tgpu.fn(getDouble);

    const main = () => {
      'use gpu';
      return getDouble4() + getDouble4();
    };

    const wgsl = tgpu.resolve([main]);
    expect(wgsl.match(/fn\s+getDouble\s*\(/g)?.length ?? 0).toBe(1);
  });
});
