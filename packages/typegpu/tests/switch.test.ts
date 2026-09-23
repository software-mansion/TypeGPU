import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { CAPTURE, captureSnippets, it } from 'typegpu-testing-utility';

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

  it('allows declarations in switch statements', () => {
    const fn = () => {
      'use gpu';
      let value = d.u32(1);
      switch (value) {
        case 1:
          let temp = 3;
          temp += 1;
          break;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        let value = 1u;
        switch value {
          case 1u: {
            var temp = 3;
            temp += 1i;
          }
          case default: {

          }
        }
      }"
    `);
  });

  it('correctly recognizes scopes', () => {
    const temp = 1;
    const fn = () => {
      'use gpu';
      let value = d.u32(1);
      switch (value) {
        case 1:
          let temp = 2;
          break;
      }
      return temp;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        let value = 1u;
        switch value {
          case 1u: {
            let temp = 2;
          }
          case default: {

          }
        }
        return 1;
      }"
    `);
  });

  it('casts to i32 when discriminant is i32', () => {
    const fn = () => {
      'use gpu';
      let a = 0;
      const value = d.i32(1);
      switch (value) {
        case -1:
          a = 1;
          break;
        case d.u32(2):
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

  it('casts to u32 when discriminant is u32', () => {
    const fn = () => {
      'use gpu';
      let a = 0;
      const value = d.u32(1);
      switch (value) {
        case d.i32(1):
          a = 1;
          break;
        case 2:
          a = 2;
          break;
        case d.u32(3):
          a = 3;
          break;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var a = 0;
        const value = 1u;
        switch value {
          case 1u: {
            a = 1i;
          }
          case 2u: {
            a = 2i;
          }
          case 3u: {
            a = 3i;
          }
          case default: {

          }
        }
      }"
    `);
  });

  it('allows comptime tests', () => {
    const mySlot = tgpu.slot();
    const fn = () => {
      'use gpu';
      const value: number = 1;
      switch (value) {
        case mySlot.$:
        case 2 + 2:
      }
    };

    expect(tgpu.resolve([tgpu.fn(fn).with(mySlot, 3)])).toMatchInlineSnapshot(`
      "fn fn_1() {
        const value = 1;
        switch value {
          case 3i, 4i: {

          }
          case default: {

          }
        }
      }"
    `);
  });

  it('allows const tests', () => {
    const one = tgpu.const(d.i32, 1);
    const two = 2;
    const fn = () => {
      'use gpu';
      const value = d.i32(1);
      switch (value) {
        case one.$:
        case two:
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "const one: i32 = 1i;

      fn fn_1() {
        const value = 1i;
        switch value {
          case one, 2i: {

          }
          case default: {

          }
        }
      }"
    `);
  });

  it('does not inline arrayOf index access', () => {
    // At the time of writing this test, this is the only non-rawCodeSnippet way
    // of obtaining a snippet of 'constant' origin that is not comptime-known.
    // In future, there may be more ways this is possible.
    // This test exists to pin this behavior, as it is used in the test below.
    const fn = () => {
      'use gpu';
      CAPTURE(d.arrayOf(d.i32, 1)()[0]);
    };

    const code = tgpu.resolve([fn]);

    expect(code).toMatchInlineSnapshot(`
      "fn fn_1() {
        array<i32, 1>()[0i];
      }"
    `);
    expect(code).toContain('array');
    expect(captureSnippets(fn)[0]?.origin).toBe('constant');
  });

  it('allows non-comptime const tests', () => {
    const fn = () => {
      'use gpu';
      const value = d.i32(1);
      switch (value) {
        case d.arrayOf(d.i32, 1)()[0]:
          return 1;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        const value = 1i;
        switch value {
          case array<i32, 1>()[0i]: {
            return 1;
          }
          case default: {

          }
        }
      }"
    `);
  });

  it('allows break in a block', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      switch (value) {
        case 1: {
          break;
        }
        case 2:
          break;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        const value = 1;
        switch value {
          case 1i: {

          }
          case 2i: {

          }
          case default: {

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

    // TODO(#2917): this is invalid code, not all paths return
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
      'use gpu';
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
      "fn fn_1() -> i32 {
        var a = 0;
        const value = 1;
        switch value {
          case default: {
            a = 3i;
          }
          case 1i: {
            a = 1i;
          }
          case 2i: {
            a = 2i;
          }
        }
        return a;
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
      return 3;
    };

    const code = tgpu.resolve([fn]);
    expect(code).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        let value = 1;
        switch value {
          case 1i: {
            return 1;
          }
          case 2i: {
            return 2;
          }
          case default: {

          }
        }
        return 3;
      }"
    `);
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

  it('does not prune wrong breaks', () => {
    const fn = () => {
      'use gpu';
      let value: number = 1;
      switch (value) {
        case 1:
          value = -1;
          break;
          value = 1;
          break;
        case 2: {
          value = -2;
          break;
          value = 2;
          break;
        }
      }
      return value;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        var value = 1;
        switch value {
          case 1i: {
            value = -1i;
            break;
            value = 1i;
          }
          case 2i: {
            value = -2i;
            break;
          }
          case default: {

          }
        }
        return value;
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
          case default: {

          }
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
              case default: {

              }
            }
          }
          case default: {

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

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Switch statement cannot have non-trivial fallthrough.
      The following switch statement is invalid:
      switch (value) {
        case 1:
          value++;
        default:
          return 1;
      }]
    `);
  });

  it('disallows conditional breaks', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      const other: number = 2;
      switch (value) {
        case 1:
          if (other === 1) {
            break;
          }
        case 2:
          return 2;
      }
      return 3;
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Switch statement cannot have non-trivial fallthrough.
      The following switch statement is invalid:
      switch (value) {
        case 1:
          if (other === 1) {
            break;
          }
        case 2:
          return 2;
      }]
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

    expect(() => tgpu.resolve([fn.with(slot, d.vec2u())])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Cannot convert value of type 'vec2u' to any of the target types: [i32, u32]]
    `);
    // TODO(#2909): Decide whether this is a bug or feature.
    // expect(() => tgpu.resolve([fn.with(slot, true)])).toThrowErrorMatchingInlineSnapshot();
  });

  it('disallows non-int tests', () => {
    const fn = () => {
      'use gpu';
      const value = 1 as number | d.v3f;
      switch (value) {
        case d.vec3f():
          return 1;
        default:
          return 0;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Cannot convert value of type 'vec3f' to any of the target types: [i32]]
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
      - fn*:fn(): All of switch tests must be constant.
      Test 'helper()' is not constant, making the following switch statement invalid. 
      This error may be caused by an implicit conversion.
      switch (value) {
        case helper():
          return 1;
        default:
          return 2;
      }]
    `);
  });

  it('disallows scope leaking', () => {
    const fn = () => {
      'use gpu';
      let value = 1;
      switch (value) {
        case 1:
          let temp = 3;
          break;
        case 2:
          // Valid JS, unfortunately.
          temp = 5;
          return temp;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Identifier temp not found]
    `);
  });

  describe('comptime pruning', () => {
    it('leaves only matching branch as default', () => {
      const fn = () => {
        'use gpu';
        switch (1 as number) {
          case 1:
            return 1;
          case 2:
          case 3:
            return 2.5;
        }
        return -1;
      };

      expect(fn()).toBe(1);
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> f32 {
          switch 1i {
            case default: {
              return 1;
            }
          }
          return -1;
        }"
      `);
    });

    it('leaves only default when other branches are unreachable', () => {
      const fn = () => {
        'use gpu';
        switch (4 as number) {
          case 1:
            return 1;
          case 2:
          case 3:
            return 2.5;
          default:
            return 4;
        }
      };

      expect(fn()).toBe(4);
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> f32 {
          switch 4i {
            case default: {
              return 4;
            }
          }
        }"
      `);
    });

    it('does not prune switch statement', () => {
      const fn = () => {
        'use gpu';
        let a = 1;
        switch (4 as number) {
          case 4:
            if (a < 10) {
              if (a > -10) {
                // even a one-case switch allows for extra control flow with break
                break;
              }
            }
            a++;
        }
      };

      const code = tgpu.resolve([fn]);

      expect(code).toMatchInlineSnapshot(`
        "fn fn_1() {
          var a = 1;
          switch 4i {
            case default: {
              if ((a < 10i)) {
                if ((a > -10i)) {
                  break;
                }
              }
              a++;
            }
          }
        }"
      `);
      expect(code).toContain('switch');
      expect(code).toContain('break');
    });

    it('prunes entire statement if no match is made', () => {
      const fn = () => {
        'use gpu';
        switch (4 as number) {
          case 1:
            return 1;
          case 2:
          case 3:
            return 2.5;
        }
        return -1;
      };

      expect(fn()).toBe(-1);
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> f32 {
          return -1;
        }"
      `);
    });

    it('does not prune fallback', () => {
      const fn = () => {
        'use gpu';
        switch (2 as number) {
          case 1:
          case 2:
          case 3:
          case 4:
            return 2.5;
        }
        return -1;
      };

      expect(fn()).toBe(2.5);
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> f32 {
          switch 2i {
            case default: {
              return 2.5;
            }
          }
          return -1;
        }"
      `);
    });

    it('does not prune default fallback', () => {
      const fn = () => {
        'use gpu';
        switch (2 as number) {
          case 1:
          case 2:
          case 3:
          default:
            return 2.5;
          case 4:
            return 4;
        }
        return -1;
      };

      expect(fn()).toBe(2.5);
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> f32 {
          switch 2i {
            case default: {
              return 2.5;
            }
          }
          return -1;
        }"
      `);
    });

    it('does not match an early default', () => {
      const fn = () => {
        'use gpu';
        switch (2 as number) {
          default:
            return 1;
          case 2:
            return 2;
        }
      };

      expect(fn()).toBe(2);
      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "fn fn_1() -> i32 {
          switch 2i {
            case default: {
              return 2;
            }
          }
        }"
      `);
    });

    it('does not prune when any of the values is not comptime-known', () => {
      const myConst = tgpu.const(d.i32, 1);
      const fn = () => {
        'use gpu';
        switch (2 as number) {
          case 0:
            return 0;
          case myConst.$:
            return 1;
        }
      };

      expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
        "const myConst: i32 = 1i;

        fn fn_1() -> i32 {
          switch 2i {
            case 0i: {
              return 0;
            }
            case myConst: {
              return 1;
            }
            case default: {

            }
          }
        }"
      `);
    });
  });
});
