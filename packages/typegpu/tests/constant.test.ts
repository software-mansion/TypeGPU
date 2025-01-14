import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import { constant } from '../src/core/constant/tgpuConstant';
import { fn } from '../src/core/function/tgpuFn';
import * as d from '../src/data';
import { parseResolved } from './utils/parseResolved';

describe('tgpu.const', () => {
  it('should inject const declaration when used in functions', () => {
    const x = constant(d.u32, 2);
    const fn1 = fn([])
      .does(`() {
        return x;
      }`)
      .$uses({ x })
      .$name('fn1');

    expect(parseResolved({ fn1 })).toEqual(
      parse(`
        const x = 2;
        fn fn1() {
          return x;
        }
      `),
    );
  });
});
