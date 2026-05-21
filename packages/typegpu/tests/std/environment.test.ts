import { it } from 'typegpu-testing-utility';
import { expect, describe } from 'vitest';

import tgpu, { d } from '../../src/index.js';
import { isBeingTraspiled } from '../../src/std/index.ts';

describe('isBeingTraspiled', () => {
  it('retuns false top level', () => {
    expect(isBeingTraspiled()).toBe(false);
  });

  it('returns true during function resolution', () => {
    const f = () => {
      'use gpu';
      if (isBeingTraspiled()) {
        return 7;
      } else {
        return -7;
      }
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        {
          return 7;
        }
      }"
    `);
  });

  it('returns false inside comptime', () => {
    const checkTranspilation = tgpu.comptime(isBeingTraspiled);
    expect(checkTranspilation()).toBe(false);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation();
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = false;
      }"
    `);

    expect(checkTranspilation()).toBe(false);
  });

  it('returns false inside lazy', () => {
    const checkTranspilation = tgpu.lazy(isBeingTraspiled);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation.$;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = false;
      }"
    `);
  });

  it('returns false inside simulate', () => {
    const counter = tgpu.privateVar(d.u32, 0);

    const result = tgpu['~unstable'].simulate(() => {
      if (!isBeingTraspiled()) {
        counter.$ += 1;
      }
      return counter.$;
    });

    expect(result.value).toBe(1);
  });

  it('correctly branches during js execution', () => {
    const f = () => {
      'use gpu';
      if (isBeingTraspiled()) {
        return 7;
      } else {
        return -7;
      }
    };

    expect(f()).toBe(-7);
  });
});
