import { describe, expect } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, { std } from '../src/index.js';
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
    const countAccess = tgpu.accessor(d.f32, 2);

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
    const countAccess = tgpu.accessor(d.f32, 0);

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
    const countAccess = tgpu.accessor(d.f32, 0);

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
    const valueAccess = tgpu.accessor(d.f32);

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
    const valueAccess = tgpu.accessor(d.f32);

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
    const valueAccess = tgpu.accessor(d.f32);

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
    const valueAccess = tgpu.accessor(d.f32);
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

  it('allows for overloads', () => {
    const mySlot = tgpu.slot<number | d.v2f>();
    const f = (arg: number | d.v2f) => {
      'use gpu';
      return std.mul(arg, mySlot.$);
    };

    const fnum = tgpu.fn(f).with(mySlot, 3);
    const fvec = tgpu.fn(f).with(mySlot, d.vec2f(1, 2));

    const main = () => {
      'use gpu';
      fnum(1);
      fnum(d.vec2f());
      fvec(1);
      fvec(d.vec2f());
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "fn f(arg: i32) -> i32 {
        return (arg * 3i);
      }

      fn f_1(arg: vec2f) -> vec2f {
        return (arg * 3f);
      }

      fn f_2(arg: i32) -> vec2f {
        return (f32(arg) * vec2f(1, 2));
      }

      fn f_3(arg: vec2f) -> vec2f {
        return (arg * vec2f(1, 2));
      }

      fn main() {
        f(1i);
        f_1(vec2f());
        f_2(1i);
        f_3(vec2f());
      }"
    `);
  });

  it('can be passed into .createGuardedComputePipeline', ({ root }) => {
    const offsetSlot = tgpu.slot<number>();
    const f = tgpu.fn((x: number, y: number, z: number) => {
      'use gpu';
      console.log(x + y + z + offsetSlot.$);
    }).with(offsetSlot, 1);

    const pipeline = root.createGuardedComputePipeline(f);

    expect(tgpu.resolve([pipeline.pipeline])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> indexBuffer: atomic<u32>;

      struct SerializedLogData {
        id: u32,
        serializedData: array<u32, 63>,
      }

      @group(0) @binding(2) var<storage, read_write> dataBuffer: array<SerializedLogData, 64>;

      var<private> dataBlockIndex: u32;

      var<private> dataByteIndex: u32;

      fn nextByteIndex() -> u32{
        let i = dataByteIndex;
        dataByteIndex = dataByteIndex + 1u;
        return i;
      }

      fn serializeU32(n: u32) {
        dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
      }

      fn log1serializer(_arg_0: u32) {
        serializeU32(_arg_0);
      }

      fn log1(_arg_0: u32) {
        dataBlockIndex = atomicAdd(&indexBuffer, 1);
        if (dataBlockIndex >= 64) {
          return;
        }
        dataBuffer[dataBlockIndex].id = 1;
        dataByteIndex = 0;

        log1serializer(_arg_0);
      }

      fn f(x: u32, y: u32, z: u32) {
        log1((((x + y) + z) + 1u));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(1, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        f(in.id.x, in.id.y, in.id.z);
      }"
    `);
  });
});
