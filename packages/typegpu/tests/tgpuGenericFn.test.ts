import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { it } from './utils/extendedIt.ts';

describe('TgpuGenericFn - shellless callback wrapper', () => {
  it('can be called in js', () => {
    const getValue = () => {
      'use gpu';
      return 2;
    };

    const getValueGeneric = tgpu.fn(getValue);

    expect(getValueGeneric()).toBe(2);
  });

  it('generates only one definition when both original and wrapped function are used', () => {
    const countAccess = tgpu['~unstable'].accessor(d.f32, 2);

    const getDouble = () => {
      'use gpu';
      return countAccess.$ * 2;
    };

    const getDouble2 = tgpu.fn(getDouble);

    const main = () => {
      'use gpu';
      const original = getDouble();
      const wrapped = getDouble2();
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

    const getDouble2 = tgpu.fn(getDouble);

    const main = () => {
      'use gpu';
      return getDouble2();
    };

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

    const getDouble2 = tgpu.fn(getDouble);

    const main = () => {
      'use gpu';
      return getDouble2() + getDouble2();
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
    const multiplier = tgpu.slot(2);

    const scale = () => {
      'use gpu';
      return d.f32(multiplier.$) * d.f32(2);
    };

    const scaleGeneric = tgpu.fn(scale);
    const scaleBy3 = scaleGeneric.with(multiplier, 3).$name('scaleBy3');
    const scaleBy4 = scaleGeneric.with(multiplier, 4).$name('scaleBy4');

    const main = () => {
      'use gpu';
      return scale() + scaleBy3() + scaleBy4();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn scale() -> f32 {
        return 4f;
      }

      fn scaleBy3() -> f32 {
        return 6f;
      }

      fn scaleBy4() -> f32 {
        return 8f;
      }

      fn main() -> f32 {
        return ((scale() + scaleBy3()) + scaleBy4());
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

  it('generates one function even when .with is called multiple times with the same arguments', () => {
    const valueAccess = tgpu['~unstable'].accessor(d.f32);

    const getValue = () => {
      'use gpu';
      return valueAccess.$;
    };

    const getValueGeneric = tgpu.fn(getValue).with(valueAccess, 2);
    const getValueGenericAgain = getValueGeneric.with(valueAccess, 2);

    const main = () => {
      'use gpu';
      return getValueGeneric() + getValueGenericAgain();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getValue() -> f32 {
        return 2f;
      }

      fn main() -> f32 {
        return (getValue() + getValue());
      }"
    `);
  });

  it('allows for shellless inline usage', () => {
    const valueAccess = tgpu['~unstable'].accessor(d.f32);

    const getValueGeneric = tgpu.fn(() => {
      'use gpu';
      return valueAccess.$;
    }).with(valueAccess, 2);

    const main = () => {
      'use gpu';
      return getValueGeneric();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getValueGeneric() -> f32 {
        return 2f;
      }

      fn main() -> f32 {
        return getValueGeneric();
      }"
    `);
  });

  it('shellfull vs shellless', () => {
    const valueAccess = tgpu['~unstable'].accessor(d.f32);
    const slot = tgpu.slot<number>();

    const getValue = tgpu.fn(() => {
      'use gpu';
      return valueAccess.$ * slot.$;
    })
      .with(valueAccess, 2)
      .with(valueAccess, 4)
      .with(slot, 7)
      .with(slot, 5);

    const getValueShelled = tgpu.fn([], d.f32)(() => {
      'use gpu';
      return valueAccess.$ * slot.$;
    })
      .with(valueAccess, 2)
      .with(valueAccess, 4)
      .with(slot, 7)
      .with(slot, 5);

    const main = () => {
      'use gpu';
      return getValue() + getValueShelled();
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn getValue() -> f32 {
        return 20f;
      }

      fn getValueShelled() -> f32 {
        return 20f;
      }

      fn main() -> f32 {
        return (getValue() + getValueShelled());
      }"
    `);
  });
});
