import tgpu, { d } from 'typegpu';
import { test } from 'typegpu-testing-utility';
import { expectSideEffects } from '../utils/parseResolved.ts';
import { describe } from 'vitest';

describe('code without side-effects', () => {
  test('scalar literals', () => {
    const returnSlot = tgpu.slot();
    const fn = tgpu.fn(() => {
      'use gpu';
      return returnSlot.$;
    });

    expectSideEffects(fn.with(returnSlot, 0)).toEqual(false);
    expectSideEffects(fn.with(returnSlot, 1.5)).toEqual(false);
    expectSideEffects(fn.with(returnSlot, -100)).toEqual(false);
    expectSideEffects(fn.with(returnSlot, false)).toEqual(false);
  });

  test('vectors created from literals', () => {
    expectSideEffects(() => {
      'use gpu';
      return d.vec3f();
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      return d.vec3f(1, 2, 3);
    }).toEqual(false);
  });

  test('variables', () => {
    expectSideEffects(() => {
      'use gpu';
      const hello = 1;
      return hello;
    }).toEqual(false);

    expectSideEffects(() => {
      'use gpu';
      const hello = [1, 2, 3];
      return hello;
    }).toEqual(false);
  });

  test('indexed arrays', () => {
    expectSideEffects(() => {
      'use gpu';
      const hello = [1, 2, 3];
      return hello[0];
    }).toEqual(false);
  });

  test('vectors created from indexed arrays', () => {
    expectSideEffects(() => {
      'use gpu';
      const arr = [1, 2, 3];
      return d.vec3f(arr[0]!);
    }).toEqual(false);
  });

  test('vector from accessor', () => {
    const v = tgpu.accessor(d.vec3f, d.vec3f());
    expectSideEffects(() => {
      'use gpu';
      return v.$;
    }).toEqual(false);
  });

  test('prop access', () => {
    const Foo = d.struct({
      prop: d.f32,
    });

    expectSideEffects(() => {
      'use gpu';
      const foo = Foo();
      return foo.prop;
    }).toEqual(false);
  });
});

describe('code with side-effects', () => {
  test('vectors created from side-effectful components', () => {
    const next = tgpu.privateVar(d.f32);

    function getNextValue() {
      'use gpu';
      return next.$;
    }

    expectSideEffects(() => {
      'use gpu';
      return d.vec3f(getNextValue(), getNextValue(), getNextValue());
    }).toEqual(true);
  });
});
