import { describe, expect } from 'vitest';
import { tgpu, d, std } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('slots on the CPU', () => {
  it('reads the default value of a slot', () => {
    const factorSlot = tgpu.slot(2);

    const scale = tgpu.fn(
      [d.f32],
      d.f32,
    )((v) => {
      'use gpu';
      return v * factorSlot.$;
    });

    expect(scale(3)).toBe(6);
  });

  it('reads the default value of a slot in a shellless function', () => {
    const factorSlot = tgpu.slot(2);

    const scale = (v: number) => {
      'use gpu';
      return v * factorSlot.$;
    };

    expect(scale(3)).toBe(6);
  });

  it('reads a value bound with .with()', () => {
    const factorSlot = tgpu.slot(2);

    const scale = tgpu.fn(
      [d.f32],
      d.f32,
    )((v) => {
      'use gpu';
      return v * factorSlot.$;
    });

    const scaleBy5 = scale.with(factorSlot, 5);

    expect(scaleBy5(3)).toBe(15);
    // The original function is unaffected
    expect(scale(3)).toBe(6);
  });

  it('reads a value bound with .pipe()', () => {
    const factorSlot = tgpu.slot(2);
    const offsetSlot = tgpu.slot(0);

    const transform = tgpu.fn(
      [d.f32],
      d.f32,
    )((v) => {
      'use gpu';
      return v * factorSlot.$ + offsetSlot.$;
    });

    const piped = transform.pipe((cfg) => cfg.with(factorSlot, 3).with(offsetSlot, 1));

    expect(piped(2)).toBe(7);
  });

  it('propagates bound values to nested function calls', () => {
    const factorSlot = tgpu.slot(2);

    const inner = (v: number) => {
      'use gpu';
      return v * factorSlot.$;
    };

    const innerFn = tgpu.fn([d.f32], d.f32)((v) => inner(v) + 1);

    const outer = tgpu.fn([d.f32], d.f32)((v) => innerFn(v) + inner(v));

    expect(outer(2)).toBe(9);
    expect(outer.with(factorSlot, 10)(2)).toBe(41);
  });

  it('uses the innermost binding', () => {
    const factorSlot = tgpu.slot(2);

    const inner = tgpu.fn([], d.f32)(() => factorSlot.$);
    const innerBound = inner.with(factorSlot, 7);

    const outer = tgpu.fn([], d.f32)(() => inner() + innerBound());

    expect(outer.with(factorSlot, 3)()).toBe(10);
    // Same as on the GPU, re-binding an already bound slot overrides the previous value
    expect(innerBound.with(factorSlot, 100)()).toBe(100);
  });

  it('reads a value bound to a generic function', () => {
    const factorSlot = tgpu.slot(2);

    const scale = tgpu.fn((v: number) => {
      'use gpu';
      return v * factorSlot.$;
    });

    expect(scale(3)).toBe(6);
    expect(scale.with(factorSlot, 4)(3)).toBe(12);

    const scaleFn = tgpu.fn([d.f32], d.f32)(scale.with(factorSlot, 5));
    expect(scaleFn(3)).toBe(15);
  });

  it('unwraps a slot bound to another slot', () => {
    const aSlot = tgpu.slot(1);
    const bSlot = tgpu.slot<number>();

    const getB = tgpu.fn([], d.f32)(() => bSlot.$);

    expect(getB.with(bSlot, aSlot)()).toBe(1);
    expect(getB.with(bSlot, aSlot).with(aSlot, 5)()).toBe(5);
  });

  it('dereferences constants provided to slots', () => {
    const constant = tgpu.const(d.vec3f, d.vec3f(1, 2, 3));
    const vecSlot = tgpu.slot(constant);

    const getVec = tgpu.fn([], d.vec3f)(() => vecSlot.$);

    expect(getVec()).toStrictEqual(d.vec3f(1, 2, 3));
  });

  it('calls functions provided to slots', () => {
    const opSlot = tgpu.slot((a: number, b: number) => {
      'use gpu';
      return a + b;
    });

    const mul = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => a * b);

    const apply = tgpu.fn([d.f32, d.f32], d.f32)((a, b) => opSlot.$(a, b));

    expect(apply(2, 3)).toBe(5);
    expect(apply.with(opSlot, mul)(2, 3)).toBe(6);
    expect(apply.with(opSlot, std.max)(2, 3)).toBe(3);
  });

  it('calls bound functions provided to slots, keeping their bindings', () => {
    const factorSlot = tgpu.slot(2);
    const opSlot = tgpu.slot<(v: number) => number>();

    const scale = tgpu.fn([d.f32], d.f32)((v) => v * factorSlot.$);
    const apply = tgpu.fn([d.f32], d.f32)((v) => opSlot.$(v) + factorSlot.$);

    expect(apply.with(opSlot, scale.with(factorSlot, 10)).with(factorSlot, 1)(3)).toBe(31);
  });

  it('throws when a slot has no value', () => {
    const factorSlot = tgpu.slot<number>().$name('factor');

    const getFactor = tgpu.fn([], d.f32)(() => factorSlot.$);

    expect(() => getFactor()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:getFactor: Missing value for 'slot:factor']
    `);
  });

  it('allows reading slots outside of functions, within a bound scope', () => {
    const factorSlot = tgpu.slot(2);
    expect(factorSlot.$).toBe(2);
  });
});

describe('accessors on the CPU', () => {
  it('reads the default JS value of an accessor', () => {
    const colorAccess = tgpu.accessor(d.vec3f, d.vec3f(1, 0, 0));

    const getColor = tgpu.fn([], d.vec3f)(() => colorAccess.$);

    expect(getColor()).toStrictEqual(d.vec3f(1, 0, 0));
  });

  it('casts the provided JS value to the accessor schema', () => {
    const countAccess = tgpu.accessor(d.u32, 2.5);

    const getCount = () => {
      'use gpu';
      return countAccess.$;
    };

    expect(getCount()).toBe(2);
  });

  it('copies the provided JS value', () => {
    const value = d.vec3f(1, 2, 3);
    const colorAccess = tgpu.accessor(d.vec3f, value);

    const getColor = tgpu.fn(
      [],
      d.vec3f,
    )(() => {
      const color = colorAccess.$;
      return color;
    });

    const result = getColor();
    expect(result).toStrictEqual(value);
    expect(result).not.toBe(value);
  });

  it('reads a value bound with .with()', () => {
    const colorAccess = tgpu.accessor(d.vec3f, d.vec3f(1, 0, 0));

    const getColor = tgpu.fn([], d.vec3f)(() => colorAccess.$);

    expect(getColor.with(colorAccess, d.vec3f(0, 1, 0))()).toStrictEqual(d.vec3f(0, 1, 0));
  });

  it('reads a value from a constant', () => {
    const colorAccess = tgpu.accessor(d.vec3f);
    const constant = tgpu.const(d.vec3f, d.vec3f(0, 0, 1));

    const getColor = tgpu.fn([], d.vec3f)(() => colorAccess.$);

    expect(getColor.with(colorAccess, constant)()).toStrictEqual(d.vec3f(0, 0, 1));
  });

  it('reads a value returned from a function', () => {
    const colorAccess = tgpu.accessor(d.vec3f);
    const factorSlot = tgpu.slot(1);

    const getColor = tgpu.fn([], d.vec3f)(() => colorAccess.$);

    const computeColor = tgpu.fn([], d.vec3f)(() => d.vec3f(1, 2, 3).mul(factorSlot.$));
    const shellless = () => {
      'use gpu';
      return d.vec3f(4, 5, 6);
    };

    expect(getColor.with(colorAccess, computeColor)()).toStrictEqual(d.vec3f(1, 2, 3));
    expect(getColor.with(colorAccess, computeColor).with(factorSlot, 2)()).toStrictEqual(
      d.vec3f(2, 4, 6),
    );
    expect(getColor.with(colorAccess, shellless)()).toStrictEqual(d.vec3f(4, 5, 6));
    expect(getColor.with(colorAccess, () => d.vec3f(7, 8, 9))()).toStrictEqual(d.vec3f(7, 8, 9));
    expect(
      getColor.with(
        colorAccess,
        tgpu.comptime(() => d.vec3f(1, 1, 1)),
      )(),
    ).toStrictEqual(d.vec3f(1, 1, 1));
  });

  it('reads a runtime-sized array from an accessor', () => {
    const dataAccess = tgpu.accessor(d.arrayOf(d.f32), [1, 2, 3]);

    const sum = tgpu.fn(
      [],
      d.f32,
    )(() => {
      let result = d.f32(0);
      for (const v of tgpu.unroll(dataAccess.$)) {
        result += v;
      }
      return result;
    });

    expect(sum()).toBe(6);
  });

  it('throws when an accessor has no value', () => {
    const colorAccess = tgpu.accessor(d.vec3f).$name('color');

    const getColor = tgpu.fn([], d.vec3f)(() => colorAccess.$);

    expect(() => getColor()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:getColor: Missing value for 'slot:color']
    `);
  });

  it('throws when reading a mutable accessor', () => {
    const counterAccess = tgpu.mutableAccessor(d.u32).$name('counter');

    const getCounter = tgpu.fn([], d.u32)(() => counterAccess.$);

    expect(() => getCounter.with(counterAccess, () => 5)()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:getCounter: Cannot use 'mutable-accessor:counter' when executing on the CPU (including tgpu.simulate). Mutable accessors can only be used in shader code. Use tgpu.accessor for read-only access, or pass the value as an argument instead.]
    `);
  });

  it('throws when writing to a mutable accessor', () => {
    const counter = tgpu.privateVar(d.u32, 10);
    const counterAccess = tgpu.mutableAccessor(d.u32).$name('counter');

    const resetCounter = tgpu.fn([])(() => {
      counterAccess.$ = 0;
    });

    expect(() => resetCounter.with(counterAccess, counter)()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:resetCounter: Cannot use 'mutable-accessor:counter' when executing on the CPU (including tgpu.simulate). Mutable accessors can only be used in shader code. Use tgpu.accessor for read-only access, or pass the value as an argument instead.]
    `);
  });

  it('reads variables through accessors in tgpu.simulate', () => {
    const counter = tgpu.privateVar(d.u32, 10);
    const readAccess = tgpu.accessor(d.u32);

    const read = tgpu.fn([], d.u32)(() => readAccess.$);

    const result = tgpu['~unstable'].simulate(() => read.with(readAccess, counter)());

    expect(result.value).toBe(10);
  });

  it('throws when using a mutable accessor in tgpu.simulate', () => {
    const counter = tgpu.privateVar(d.u32, 10);
    const counterAccess = tgpu.mutableAccessor(d.u32).$name('counter');

    const increment = tgpu.fn([])(() => {
      counterAccess.$ += 1;
    });

    expect(() => tgpu['~unstable'].simulate(() => increment.with(counterAccess, counter)()))
      .toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:increment: Cannot use 'mutable-accessor:counter' when executing on the CPU (including tgpu.simulate). Mutable accessors can only be used in shader code. Use tgpu.accessor for read-only access, or pass the value as an argument instead.]
    `);
  });
});

describe('lazy values on the CPU', () => {
  it('computes the value of a lazy', () => {
    const doubled = tgpu.lazy(() => 2 * 3);

    const getDoubled = tgpu.fn([], d.f32)(() => doubled.$);

    expect(getDoubled()).toBe(6);
  });

  it('computes a lazy depending on a slot', () => {
    const factorSlot = tgpu.slot(2);
    let computeCount = 0;
    const scaled = tgpu.lazy(() => {
      computeCount++;
      return factorSlot.$ * 10;
    });

    const getScaled = tgpu.fn([], d.f32)(() => scaled.$);

    expect(getScaled()).toBe(20);
    expect(getScaled.with(factorSlot, 3)()).toBe(30);
    expect(getScaled()).toBe(20);
    expect(computeCount).toBe(3);
  });

  it('computes a lazy at most once per call and slot-value combination', () => {
    const factorSlot = tgpu.slot(2);
    let computeCount = 0;
    const scaled = tgpu.lazy(() => {
      computeCount++;
      return factorSlot.$ * 10;
    });

    const getScaled = tgpu.fn([], d.f32)(() => scaled.$);
    const getScaled3 = getScaled.with(factorSlot, 3);
    const sumAll = tgpu.fn([], d.f32)(() => getScaled() + scaled.$ + getScaled3() + getScaled3());

    expect(sumAll()).toBe(100);
    // Once for the default value, once for the bound value
    expect(computeCount).toBe(2);
  });

  it('does not retain lazy values between calls', () => {
    const vecSlot = tgpu.slot(d.vec3f());
    let computeCount = 0;
    const lz = tgpu.lazy(() => {
      computeCount++;
      return vecSlot.$.x;
    });

    const getX = tgpu.fn([], d.f32)(() => lz.$);

    for (let i = 0; i < 100; i++) {
      expect(getX.with(vecSlot, d.vec3f(i, 0, 0))()).toBe(i);
    }
    // Recomputed on every call, since nothing is cached across calls
    expect(computeCount).toBe(100);
  });

  it('computes a lazy with bound values', () => {
    const factorSlot = tgpu.slot(2);
    const scaled = tgpu.lazy(() => factorSlot.$ * 10);
    const scaledBy4 = scaled.with(factorSlot, 4);

    const getScaled = tgpu.fn([], d.f32)(() => scaledBy4.$);

    expect(getScaled()).toBe(40);
    expect(getScaled.with(factorSlot, 3)()).toBe(40);
  });

  it('dereferences a constant returned from a lazy', () => {
    const table = tgpu.lazy(() => tgpu.const(d.arrayOf(d.f32, 3), [1, 2, 3]));

    const getElement = tgpu.fn([d.u32], d.f32)((idx) => table.$[idx] as number);

    expect(getElement(1)).toBe(2);
  });

  it('unwraps a lazy provided to a slot', () => {
    const factorSlot = tgpu.slot(2);
    const valueSlot = tgpu.slot<number>();
    const scaled = tgpu.lazy(() => factorSlot.$ * 10);

    const getValue = tgpu.fn([], d.f32)(() => valueSlot.$);

    expect(getValue.with(valueSlot, scaled)()).toBe(20);
    expect(getValue.with(valueSlot, scaled.with(factorSlot, 5))()).toBe(50);
  });

  it('provides a lazy to an accessor through a function', () => {
    const factorSlot = tgpu.slot(2);
    const colorAccess = tgpu.accessor(d.vec3f);
    const color = tgpu.lazy(() => d.vec3f(1, 2, 3).mul(factorSlot.$));

    const getColor = tgpu.fn([], d.vec3f)(() => colorAccess.$);

    expect(getColor.with(colorAccess, () => color.$)()).toStrictEqual(d.vec3f(2, 4, 6));
  });
});

describe('slots, accessors and lazy values on the CPU within a resolution', () => {
  it('reads slot values bound to a function called during lazy computation', () => {
    const sizeSlot = tgpu.slot(2);

    const computeElement = tgpu.fn([d.u32], d.f32)((i) => d.f32(i * sizeSlot.$));
    const table = tgpu.lazy(() =>
      tgpu.const(
        d.arrayOf(d.f32, 3),
        Array.from({ length: 3 }, (_, i) => computeElement.with(sizeSlot, 10)(i)),
      ),
    );

    const main = tgpu.fn([], d.f32)(() => table.$[1] as number);

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const item: array<f32, 3> = array<f32, 3>(0f, 10f, 20f);

      fn main() -> f32 {
        return item[1i];
      }"
    `);
  });

  it('reads slot values bound by the resolution in a function called during lazy computation', () => {
    const sizeSlot = tgpu.slot(2);

    const computeElement = tgpu.fn([d.u32], d.f32)((i) => d.f32(i * sizeSlot.$));
    const table = tgpu.lazy(() =>
      tgpu.const(
        d.arrayOf(d.f32, 3),
        Array.from({ length: 3 }, (_, i) => computeElement(i)),
      ),
    );

    const main = tgpu.fn([], d.f32)(() => table.$[1] as number);

    expect(tgpu.resolve([main.with(sizeSlot, 5)])).toMatchInlineSnapshot(`
      "const item: array<f32, 3> = array<f32, 3>(0f, 5f, 10f);

      fn main() -> f32 {
        return item[1i];
      }"
    `);
  });

  it('dereferences variables provided to slots in tgpu.simulate', () => {
    const counter = tgpu.privateVar(d.u32, 10);
    const counterSlot = tgpu.slot(counter);

    const read = tgpu.fn([], d.u32)(() => counterSlot.$);

    const result = tgpu['~unstable'].simulate(() => {
      counter.$ += 5;
      return read();
    });

    expect(result.value).toBe(15);
  });

  it('reads slot values bound to functions called in tgpu.simulate', () => {
    const factorSlot = tgpu.slot(2);

    const scale = tgpu.fn([d.f32], d.f32)((v) => v * factorSlot.$);

    const result = tgpu['~unstable'].simulate(() => scale.with(factorSlot, 3)(2));

    expect(result.value).toBe(6);
  });

  it('inherits slot bindings when tgpu.simulate is called from a lazy computed on the CPU', () => {
    const factorSlot = tgpu.slot(2);
    const simulated = tgpu.lazy(() => tgpu['~unstable'].simulate(() => factorSlot.$).value);

    const getSimulated = tgpu.fn([], d.f32)(() => simulated.$);

    expect(getSimulated.with(factorSlot, 5)()).toBe(5);
    // The lazy depends on the inherited binding, so it's recomputed for each binding within the same call
    const getBoth = tgpu.fn(
      [],
      d.vec2f,
    )(() => d.vec2f(getSimulated.with(factorSlot, 5)(), getSimulated.with(factorSlot, 6)()));
    expect(getBoth()).toStrictEqual(d.vec2f(5, 6));
    // Matches the behavior during GPU resolution
    expect(tgpu.resolve([getSimulated.with(factorSlot, 5)])).toContain('return 5f;');
  });

  it('inherits slot bindings without defaults when tgpu.simulate is called from a bound function', () => {
    const factorSlot = tgpu.slot<number>();
    const runSimulation = () => tgpu['~unstable'].simulate(() => factorSlot.$).value;

    const getSimulated = tgpu.fn([], d.f32)(() => runSimulation());

    expect(getSimulated.with(factorSlot, 5)()).toBe(5);
  });

  it('lets bindings inside tgpu.simulate override inherited slot bindings', () => {
    const factorSlot = tgpu.slot(2);

    const getFactor = tgpu.fn([], d.f32)(() => factorSlot.$);
    const runSimulation = () =>
      tgpu['~unstable'].simulate(() => d.vec2f(getFactor(), getFactor.with(factorSlot, 7)())).value;

    const getSimulated = tgpu.fn([], d.vec2f)(() => runSimulation());

    expect(getSimulated.with(factorSlot, 5)()).toStrictEqual(d.vec2f(5, 7));
  });

  it('reuses lazy instances between a CPU call and tgpu.simulate called within it', () => {
    const factorSlot = tgpu.slot(2);
    let computeCount = 0;
    const scaled = tgpu.lazy(() => {
      computeCount++;
      return { factor: factorSlot.$ };
    });

    const results: { factor: number }[] = [];
    const collect = () => {
      results.push(scaled.$);
      results.push(tgpu['~unstable'].simulate(() => scaled.$).value);
      // Overriding the binding inside the simulation computes a new instance
      results.push(tgpu['~unstable'].simulate(() => scaled.with(factorSlot, 7).$).value);
      results.push(scaled.$);
    };

    const run = tgpu.fn([])(() => {
      collect();
    });
    run.with(factorSlot, 5)();

    expect(results.map((r) => r.factor)).toStrictEqual([5, 5, 7, 5]);
    expect(results[1]).toBe(results[0]);
    expect(results[3]).toBe(results[0]);
    expect(computeCount).toBe(2);
  });

  it('reuses lazy instances computed in tgpu.simulate after it returns to the CPU call', () => {
    let computeCount = 0;
    const computed = tgpu.lazy(() => {
      computeCount++;
      return {};
    });

    const results: object[] = [];
    const collect = () => {
      results.push(tgpu['~unstable'].simulate(() => computed.$).value);
      results.push(computed.$);
    };

    const run = tgpu.fn([])(() => {
      collect();
    });
    run();

    expect(results[1]).toBe(results[0]);
    expect(computeCount).toBe(1);
  });

  it('matches the GPU when re-binding an already bound slot', () => {
    const factorSlot = tgpu.slot(2);

    const getFactor = tgpu.fn([], d.f32)(() => factorSlot.$);
    const rebound = getFactor.with(factorSlot, 7).with(factorSlot, 100);

    expect(rebound()).toBe(100);
    expect(tgpu.resolve([rebound])).toContain('return 100f;');
  });

  it('resolves a lazy with bound values provided to a slot (GPU)', () => {
    const factorSlot = tgpu.slot(2);
    const valueSlot = tgpu.slot<number>();
    const scaled = tgpu.lazy(() => factorSlot.$ * 10);

    const getValue = tgpu.fn([], d.f32)(() => valueSlot.$);

    expect(tgpu.resolve([getValue.with(valueSlot, scaled.with(factorSlot, 5))])).toContain(
      'return 50f;',
    );
  });
});
