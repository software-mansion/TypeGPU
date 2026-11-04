import { describe, expect, expectTypeOf, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('verify that function ends with return', () => {
  it('accepts functions where all if branches return', () => {
    const fn = () => {
      'use gpu';
      const value = false;
      if (value) {
        return 1;
      } else {
        return 0;
      }
    };

    expect(() => tgpu.resolve([fn])).not.toThrow();
  });

  it('rejects functions with an if branch that does not return', () => {
    const fn = () => {
      'use gpu';
      const value = false;
      if (value) {
        return 1;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('prunes code after a switch whose all branches continue for loop', () => {
    const fn = () => {
      'use gpu';
      const t: number = 1;
      for (;;) {
        switch (t) {
          case 0:
          case 1:
            continue;
          default:
            continue;
        }
        const shouldBePruned = 1;
      }
    };

    const code = tgpu.resolve([fn]);
    expect(code).toMatchInlineSnapshot(`
      "fn fn_1() {
        const t = 1;
        for (; ; ) {
          switch t {
            case 0i, 1i: {
              continue;
            }
            case default: {
              continue;
            }
          }
        }
      }"
    `);
    expect(code).not.toContain('shouldBePruned');
  });

  it('accepts switches with returning cases and a returning default', () => {
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

    expect(() => tgpu.resolve([fn])).not.toThrow();
  });

  it('rejects switches with a default branch that does not return', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      switch (value) {
        case 1:
          return 0;
        case 2:
        default:
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('accepts switches with grouped returning cases', () => {
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

    expect(() => tgpu.resolve([fn])).not.toThrow();
  });

  it('accepts nested conditional returns within a switch case', () => {
    const fn = () => {
      'use gpu';
      const a = 3;
      switch (1 as number) {
        case 0:
          return 0;
        case 1:
          if (a < 3) {
            return 3;
          } else {
            return a;
          }
          break;
        case 2:
          return 2;
        default:
          return -1;
      }
    };

    expect(() => tgpu.resolve([fn])).not.toThrow();
  });

  it('accepts a return after a switch containing all break statements', () => {
    const fn = tgpu.fn(
      [],
      d.i32,
    )(() => {
      const a: number = 10;
      switch (a) {
        case 0:
          break;
        case 1:
          break;
        case 2:
          break;
      }

      return 2;
    });

    expect(() => tgpu.resolve([fn])).not.toThrow();
  });

  it('preserves a return after a switch with returning cases', () => {
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
    expect(code).toContain('return 3');
  });

  it('rejects switches without a default or return after the switch', () => {
    const fn = () => {
      'use gpu';
      let value = 1;
      switch (value) {
        case 1:
          return 1;
        case 2:
          return 2;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('...', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      const x: number = 2;
      switch (value) {
        case 1:
          if (x === 2) {
            break;
          } else {
            return 3;
          }
          return 4;
        default:
          return 2;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        const value = 1;
        const x = 2;
        switch value {
          case 1i: {
            if ((x == 2i)) {
              break;
            }
            else {
              return 3;
            }
            return 4;
          }
          case default: {
            return 2;
          }
        }
      }"
    `);
    // expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot();
  });

  it('...3', () => {
    const fn = () => {
      'use gpu';
      const x: number = 2;
      for (;;) {
        return x;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        const x = 2;
        for (; ; ) {
          return x;
        }
      }"
    `);
  });
});
