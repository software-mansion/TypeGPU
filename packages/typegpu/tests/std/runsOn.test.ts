import { it } from 'typegpu-testing-utility';
import { expect, describe } from 'vitest';

import tgpu, { d } from '../../src/index.js';
import { runsOn, type Runtime } from '../../src/std/index.ts';

describe('runsOn', () => {
  it('correctly determines cpu runtime top level', () => {
    expect(runsOn('cpu')).toBe(true);
    expect(runsOn('gpu')).toBe(false);
  });

  it('correctly determines gpu runtime at function resolution time', () => {
    const f = () => {
      'use gpu';
      if (runsOn('gpu')) {
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

  it('correctly determines cpu runtime in comptime', () => {
    const checkRuntime = tgpu.comptime((runtime: Runtime) => runsOn(runtime));

    expect(checkRuntime('cpu')).toBe(true);
    expect(checkRuntime('gpu')).toBe(false);

    const f = () => {
      'use gpu';
      const _cpu = checkRuntime('cpu');
      const _gpu = checkRuntime('gpu');
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _cpu = true;
        const _gpu = false;
      }"
    `);
  });

  it('correctly determines cpu runtime in lazy', () => {
    const checkRuntimeCPU = tgpu.lazy(() => runsOn('cpu'));
    const checkRuntimeGPU = tgpu.lazy(() => runsOn('gpu'));

    const f = () => {
      'use gpu';
      const _cpu = checkRuntimeCPU.$;
      const _gpu = checkRuntimeGPU.$;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _cpu = true;
        const _gpu = false;
      }"
    `);
  });

  it('correctly branches on cpu/gpu runtime during execution', () => {
    const f = () => {
      'use gpu';
      if (runsOn('gpu')) {
        return 7;
      } else {
        return -7;
      }
    };

    expect(f()).toBe(-7);
  });
});
