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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = 0;
        const value = 1;
        switch value {
          case 1i: {
            a = 1i;
          }
          case 2i: {
            a = 2i;
          }
          case default: {
            a = 3i;
          }
        }
      }"
    `);
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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = 0;
        const value = 1i;
        switch value {
          case -1i: {
            a = 1i;
          }
          case 2i: {
            a = 2i;
          }
          case default: {
            a = 3i;
          }
        }
      }"
    `);
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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        const value = 1;
        switch value {
          case 1i: {
            return 0;
          }
          case 2i: {
            return 1;
          }
          case default: {

          }
        }
      }"
    `);
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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var total = 0;
        for (var i = 0; (i < 10i); i++) {
          switch i {
            case 7i: {
              continue;
            }
            case default: {
              total += i;
            }
          }
        }
      }"
    `);
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
    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
          "fn fn_1() {
            var total = 0;
            for (var i = 0; (i < 10i); i++) {
              switch i {
          case 7i: {
              continue;
          }
          case default: {
              total += i;
          }}
            }
          }"
        `);
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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        const value = 1;
        switch value {
          case 1i, 2i: {
            return 0;
          }
          case default: {
            return 1;
          }
        }
      }"
    `);
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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
            "fn fn_1() -> i32 {
              const value = 1;
              switch value {
                case 1i: {
                  return 0;
                }
                case 2i, default: {
                  return 1;
                }
              }
            }"
          `);
  });

  it('handles empty switch statement', () => {
    const fn = () => {
      'use gpu';
      const value = 1;
      switch (value) {
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() {
          const value = 1;
          switch value {

          }
        }"
      `);
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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
              "fn fn_1() -> i32 {
                const value = 1;
                switch value {
                  case 1i: {
                    switch (value + 1i) {
                      case 2i: {
                        return 3;
                      }
                    }
                  }
                }
              }"
            `);
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

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          var value = 1;
          switch value {
            case 1i: {
              value++;
            }
            case default: {
              return 1;
            }
          }
        }"
      `);
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

    expect(() => tgpu.resolve([fn.with(slot, 1.5)])).toThrowErrorMatchingInlineSnapshot(`
          "fn fn_1() -> i32 {
            var value = 1;
            switch value {
          case 1i: {
            value++;
          }
          case default: {
            return 1;
          }}
          }"
        `);
    expect(() => tgpu.resolve([fn.with(slot, d.vec2u())])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Cannot convert value of type 'vec2u' to any of the target types: [u32, i32]]
    `);
    expect(() => tgpu.resolve([fn.with(slot, true)])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): discriminantExpr is not defined]
    `);
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

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): discriminantExpr is not defined]
    `);
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

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Switch statement must have all tests known at comptime.
      Test 'value' is not known at comptime, making the following switch statement invalid:
      switch (value) {
        case helper():
          return 1;
        default:
          return 2;
      }]
    `);
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

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Switch statement cannot contain duplicate tests.
      Test '1' appears more than once, making the following switch statement invalid:
      switch (value) {
        case 1:
          return 1;
        case 2:
          return 2;
        case 1:
          return 3;
        default:
          return 4;
      }]
    `);
  });
});
