import { it } from 'typegpu-testing-utility';
import { expect, describe } from 'vitest';

import tgpu, { d, std } from '../../src/index.js';

describe('isBeingTranspiled', () => {
  it('returns false top level', () => {
    expect(std.isBeingTranspiled()).toBe(false);
  });

  it('returns true during function resolution', () => {
    const f = () => {
      'use gpu';
      if (std.isBeingTranspiled()) {
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
    const checkTranspilation = tgpu.comptime(std.isBeingTranspiled);
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
    const checkTranspilation = tgpu.lazy(std.isBeingTranspiled);

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
      if (!std.isBeingTranspiled()) {
        counter.$ += 1;
      }
      return counter.$;
    });

    expect(result.value).toBe(1);
  });

  it('correctly branches during js execution', () => {
    const f = () => {
      'use gpu';
      if (std.isBeingTranspiled()) {
        return 7;
      } else {
        return -7;
      }
    };

    expect(f()).toBe(-7);
  });
});

describe('getTargetShaderLanguage', () => {
  it('returns undefined top level', () => {
    expect(std.getTargetShaderLanguage()).toBe(undefined);
  });

  it('returns `wgsl` during function resolution', () => {
    const f = () => {
      'use gpu';
      if (std.getTargetShaderLanguage() === 'wgsl') {
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

  it('returns undefined inside comptime outside of resolution and `wgsl` during function resolution', () => {
    const checkTranspilation = tgpu.comptime(std.getTargetShaderLanguage);
    expect(checkTranspilation()).toBe(undefined);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation() === 'wgsl';
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = true;
      }"
    `);

    expect(checkTranspilation()).toBe(undefined);
  });

  it('returns `wgsl` inside lazy', () => {
    const checkTranspilation = tgpu.lazy(std.getTargetShaderLanguage);

    const f = () => {
      'use gpu';
      const _transpilation = checkTranspilation.$ === 'wgsl';
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() {
        const _transpilation = true;
      }"
    `);
  });

  it('returns undefined inside simulate', () => {
    const counter = tgpu.privateVar(d.u32, 0);

    const result = tgpu['~unstable'].simulate(() => {
      if (std.getTargetShaderLanguage() !== 'wgsl') {
        counter.$ += 1;
      }
      return counter.$;
    });

    expect(result.value).toBe(1);
  });

  it('correctly branches during js execution', () => {
    const f = () => {
      'use gpu';
      if (std.getTargetShaderLanguage() === 'wgsl') {
        return 7;
      } else {
        return -7;
      }
    };

    expect(f()).toBe(-7);
  });
});
