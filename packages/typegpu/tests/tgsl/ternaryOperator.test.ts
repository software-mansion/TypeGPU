import { describe, expect } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import * as d from '../../src/data/index.ts';
import tgpu from '../../src/index.ts';

describe('ternary operator', () => {
  it('should resolve to one of the branches', () => {
    const mySlot = tgpu.slot<boolean>();
    const myFn = tgpu.fn([], d.u32)(() => {
      return mySlot.$ ? 10 : 20;
    });

    expect(
      tgpu.resolve([
        myFn.with(mySlot, true).$name('trueFn'),
        myFn.with(mySlot, false).$name('falseFn'),
      ]),
    )
      .toMatchInlineSnapshot(`
        "fn falseFn() -> u32 {
          return 10u;
        }

        fn falseFn_1() -> u32 {
          return 20u;
        }"
      `);
  });
});
