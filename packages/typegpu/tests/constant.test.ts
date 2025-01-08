import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, it } from 'vitest';
import * as d from '../src/data';
import tgpu from '../src/experimental';
import { parseResolved } from './utils/parseResolved';

describe('tgpu.const', () => {
  it('should inject const declaration when used in functions', () => {
    const x = tgpu.const(d.u32, 2);
    const fn1 = tgpu
      .fn([])
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
