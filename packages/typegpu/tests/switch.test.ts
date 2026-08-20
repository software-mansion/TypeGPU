// TODO: re-enable this
// oxlint-disable typegpu/no-unsupported-syntax
import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe(`switch statement in 'use gpu' functions`, () => {
  it('allows switch statements', () => {
    const fn = () => {
      'use gpu';
      let a = 0;
      const value: number = 1;
      switch (value) {
        case 1:
          a = 1;
          break;
        case 2:
          a = 2;
          break;
        default:
          a = 3;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('allows negative numbers', () => {
    const fn = () => {
      'use gpu';
      let a = 0;
      const value = d.i32(1);
      switch (value) {
        case -1:
          a = 1;
          break;
        case 2:
          a = 2;
          break;
        default:
          a = 3;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('allows return', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      switch (value) {
        case 1:
          return 0;
        case 2:
          return 1;
        default:
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('allows continue', () => {
    const fn = () => {
      'use gpu';
      let total = 0;
      for (let i = 0; i < 10; i++) {
        switch (i) {
          case 7:
            continue;
          default:
            total += i;
        }
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('allows weird order of cases', () => {
    // In JS, first non-default is matched.
    // In WGSL, "effectively" the same happens.
    const fn = () => {
      // 'use gpu';
      let a = 0;
      const value: number = 1;
      switch (value) {
        default:
          a = 3;
          break;
        case 1:
          a = 1;
          break;
        case 2:
          a = 2;
          break;
      }
      return a;
    };

    expect(fn()).toBe(1);
    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('adds default to switches without a default', () => {
    const fn = () => {
      'use gpu';
      let value = 1;
      switch (value) {
        case 1:
          return 1;
        case 2:
          return 2;
      }
      return;
    };

    const code = tgpu.resolve([fn]);
    expect(code).toMatchInlineSnapshot();
    expect(code).toContain('default');
  });

  it('allows empty fallthrough', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      switch (value) {
        case 1:
        case 2:
          return 0;
        default:
          return 1;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('allows empty fallthrough to default', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      switch (value) {
        case 1:
          return 0;
        case 2:
        default:
          return 1;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('handles empty switch statement', () => {
    const fn = () => {
      'use gpu';
      const value = 1;
      switch (value) {
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('handles nested switch statement', () => {
    const fn = () => {
      'use gpu';
      const value = 1;
      switch (value) {
        case 1: {
          switch (value + 1) {
            case 2: {
              return 3;
            }
          }
        }
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('disallows non-trivial fallthrough', () => {
    const fn = () => {
      'use gpu';
      let value = 1;
      switch (value) {
        case 1:
          value++;
        default:
          return 1;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot();
  });

  it('disallows non-int types', () => {
    const slot = tgpu.slot();
    const fn = tgpu.fn(() => {
      'use gpu';
      const value = slot.$;
      switch (value) {
        default:
      }
    });

    expect(() => tgpu.resolve([fn.with(slot, 1.5)])).toThrowErrorMatchingInlineSnapshot();
    expect(() => tgpu.resolve([fn.with(slot, d.vec2u())])).toThrowErrorMatchingInlineSnapshot();
    expect(() => tgpu.resolve([fn.with(slot, true)])).toThrowErrorMatchingInlineSnapshot();
  });

  it('disallows non-int tests', () => {
    const fn = () => {
      'use gpu';
      const value = 1 as number | boolean;
      switch (value) {
        case true:
          return 1;
        default:
          return 0;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot();
  });

  it('disallows runtime tests', () => {
    const helper = () => {
      'use gpu';
      return 1;
    };

    const fn = () => {
      'use gpu';
      let value = 1;
      switch (value) {
        case helper():
          return 1;
        default:
          return 2;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot();
  });

  it('disallows duplicate cases', () => {
    const fn = () => {
      'use gpu';
      let value = 1;
      switch (value) {
        // oxlint-disable-next-line no-duplicate-case
        case 1:
          return 1;
        case 2:
          return 2;
        case 1:
          return 3;
        default:
          return 4;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot();
  });
});
