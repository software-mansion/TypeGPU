import { describe, expect, expectTypeOf, it } from 'vitest';
import { tgpu, d, std } from 'typegpu';

describe('verify function flow control', () => {
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

  it('prunes code after a switch whose branches all continue the enclosing loop', () => {
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

  it('rejects switches with conditional break', () => {
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

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('requires a return after a loop whose execution is not proven', () => {
    const fn = () => {
      'use gpu';
      const x: number = 2;
      // The WGSL generator does not propagate control flow from a loop body because it does not prove that the loop executes at least once.
      for (;;) {
        return x;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('rejects a loop that may finish without returning', () => {
    const fn = () => {
      'use gpu';
      const x: number = 2;
      for (let i = 0; ; i++) {
        if (i % 10 === 0) {
          return x;
        }
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('accepts a while loop whose conditional branches all return', () => {
    const fn = () => {
      'use gpu';
      const x: number = 2;
      while (true) {
        if (x === 2) {
          return 1;
        } else {
          return 3;
        }
      }
      return 4;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        const x = 2;
        while (true) {
          if ((x == 2i)) {
            return 1;
          }
          else {
            return 3;
          }
        }
        return 4;
      }"
    `);
  });

  it('rejects a while loop with a conditional branch that does not return', () => {
    const fn = () => {
      'use gpu';
      const x: number = 2;
      while (true) {
        if (x === 2) {
          return 1;
        }
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('rejects a for-of loop that may finish without returning', () => {
    const fn = () => {
      'use gpu';
      const arr: number[] = [1, 2, 3];

      for (const x of arr) {
        if (x === 2) {
          return 1;
        }
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('accepts a return inside a for-of loop', () => {
    const fn = () => {
      'use gpu';
      const arr: number[] = [1, 2, 3];

      for (const x of arr) {
        return 7;
      }

      return 1;
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() -> i32 {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let x = arr[i];
          return 7;
        }
        return 1;
      }"
    `);
  });

  it('does not propagate continue control flow from for-of loops', () => {
    const fn = () => {
      'use gpu';

      const arr: number[] = [1, 2, 3];
      for (const x of arr) {
        continue;
      }

      for (const x of arr) {
        continue;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let x = arr[i];
          continue;
        }
        for (var i = 0u; i < 3u; i += 1u) {
          let x = arr[i];
          continue;
        }
      }"
    `);
  });

  it('does not propagate break control flow from for-of loops', () => {
    const fn = () => {
      'use gpu';

      const arr: number[] = [1, 2, 3];
      for (const x of arr) {
        break;
      }

      for (const x of arr) {
        const a = x;
      }
    };

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1() {
        var arr = array<i32, 3>(1, 2, 3);
        for (var i = 0u; i < 3u; i += 1u) {
          let x = arr[i];
          break;
        }
        for (var i = 0u; i < 3u; i += 1u) {
          let x = arr[i];
          {
            let a = x;
          }
        }
      }"
    `);
  });

  it('rejects a function whose default case only breaks', () => {
    const fn = () => {
      'use gpu';
      const value: number = 1;
      switch (value) {
        case 1:
          return 0;
        default:
          break;
      }
    };

    expect(() => tgpu.resolve([fn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:fn
      - fn*:fn(): Function 'fn_1' is expected to return a value of type 'i32', but not all code paths return a value.]
    `);
  });

  it('rejects a switch that has a case that may end with break', () => {
    const fn = () => {
      'use gpu';
      const v1: number = 1;
      switch (v1) {
        case 1:
          const v2: number = 3;
          if (v2 === 3) {
            break;
          }
          return 1;
        default:
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

  it('accepts a return after a partially returning if statement', () => {
    const fn = () => {
      'use gpu';
      const x: number = 2;
      if (x === 3) {
        return 1;
      }

      return 2;
    };

    expect(() => tgpu.resolve([fn])).not.toThrow();
  });
});
