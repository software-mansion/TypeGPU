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
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 0f;
      }

      fn main() -> f32 {
        return getDouble();
      }"
    `);
  });

  it('does not duplicate the same function', () => {
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
    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getDouble() -> f32 {
        return 0f;
      }

      fn main() -> f32 {
        return (getDouble() + getDouble());
      }"
    `);
  });

  it('supports .with for slot bindings on generic functions', () => {
    const multiplier = tgpu.slot(2).$name('multiplier');

    const scale = () => {
      'use gpu';
      return d.f32(multiplier.$) * d.f32(2);
    };

    const scaleGeneric = tgpu.fn(scale);
    const scaleBy3 = scaleGeneric.with(multiplier, 3);
    const scaleBy4 = scaleGeneric.with(multiplier, 4);

    const main = () => {
      'use gpu';
      return scaleBy3() + scaleBy4();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn scale() -> f32 {
        return 6f;
      }

      fn scale_1() -> f32 {
        return 8f;
      }

      fn main() -> f32 {
        return (scale() + scale_1());
      }"
    `);
  });

  it('supports .with for accessor bindings on generic functions', () => {
    const valueAccess = tgpu['~unstable'].accessor(d.f32);

    const getValue = () => {
      'use gpu';
      return valueAccess.$;
    };

    const getValueGeneric = tgpu.fn(getValue).with(valueAccess, 2);

    const main = () => {
      'use gpu';
      return getValueGeneric();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getValue() -> f32 {
        return 2f;
      }

      fn main() -> f32 {
        return getValue();
      }"
    `);
  });
});
