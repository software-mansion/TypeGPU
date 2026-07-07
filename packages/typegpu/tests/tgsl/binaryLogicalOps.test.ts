import { expect, describe, beforeEach } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('binaryLogicalOps', () => {
  const Boid = d.struct({ pos: d.vec3f });
  const BoidOnSteroids = d.struct({ pos: d.vec3f, strength: d.f32 });

  describe('relational', () => {
    describe('comptime', () => {
      it('handles numeric', () => {
        const x = 7 as number;
        const y = 8 as number;

        const f = () => {
          'use gpu';
          let r = true;
          r = x === y;
          r = x !== y;
          r = x < y;
          r = x <= y;
          r = x > y;
          r = x >= y;
        };

        expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
          "fn f() {
            var r = true;
            r = false;
            r = true;
            r = true;
            r = true;
            r = false;
            r = false;
          }"
        `);
      });

      it('equality comparison handles non numeric operands', () => {
        const x = Boid();
        const y = BoidOnSteroids();

        const eq = () => {
          'use gpu';
          const _r = x === y;
        };
        const ne = () => {
          'use gpu';
          const _r = x !== y;
        };

        expect(tgpu.resolve([eq])).toMatchInlineSnapshot(`
          "fn eq() {
            const _r = false;
          }"
        `);
        expect(tgpu.resolve([ne])).toMatchInlineSnapshot(`
          "fn ne() {
            const _r = true;
          }"
        `);
      });

      it('throws when both operands are not numeric', () => {
        const x = Boid();
        const y = BoidOnSteroids();

        const eq = () => {
          'use gpu';
          const _r = x === y;
        };
        const ne = () => {
          'use gpu';
          const _r = x !== y;
        };
        const lt = () => {
          'use gpu';
          const _r = x < y;
        };
        const le = () => {
          'use gpu';
          const _r = x <= y;
        };
        const gt = () => {
          'use gpu';
          const _r = x > y;
        };
        const ge = () => {
          'use gpu';
          const _r = x >= y;
        };

        expect(() => tgpu.resolve([lt])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:lt
          - fn*:lt(): Comparison '<' requires numeric operands.]
        `);
        expect(() => tgpu.resolve([le])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:le
          - fn*:le(): Comparison '<=' requires numeric operands.]
        `);
        expect(() => tgpu.resolve([gt])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:gt
          - fn*:gt(): Comparison '>' requires numeric operands.]
        `);
        expect(() => tgpu.resolve([ge])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:ge
          - fn*:ge(): Comparison '>=' requires numeric operands.]
        `);
      });

      it('when both operands are vectors suggests std function', () => {
        const x = d.vec3f();
        const y = x;

        const f = () => {
          'use gpu';
          return x >= y;
        };

        expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:f
          - fn*:f(): Comparison '>=' requires numeric operands. For component-wise comparison, use 'std.ge''.]
        `);
      });
    });

    describe('runtime', () => {
      it('handles numeric', () => {
        const x = 7 as number;

        const f = tgpu.fn([d.i32])((y) => {
          'use gpu';
          let r = true;
          r = x === y;
          r = x !== y;
          r = x < y;
          r = x <= y;
          r = x > y;
          r = x >= y;
        });

        expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
          "fn f(y: i32) {
            var r = true;
            r = (7i == y);
            r = (7i != y);
            r = (7i < y);
            r = (7i <= y);
            r = (7i > y);
            r = (7i >= y);
          }"
        `);
      });

      it('equality comparison handles boolean operands', () => {
        const a = false;
        const cAccessor = tgpu.accessor(d.bool, () => true);
        const f = tgpu.fn([d.bool])((b) => {
          'use gpu';
          let r = true;
          r = cAccessor.$ === b;
          r = a !== b;
        });

        expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
          "fn f(b: bool) {
            var r = true;
            r = (true == b);
            r = (false != b);
          }"
        `);
      });

      it('throws when both operands are not numeric', () => {
        const xAccessor = tgpu.accessor(Boid, () => Boid());

        const eq = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ === Boid(y);
        });
        const ne = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ !== Boid(y);
        });
        const lt = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ < Boid(y);
        });
        const le = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ <= Boid(y);
        });
        const gt = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ > Boid(y);
        });
        const ge = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ >= Boid(y);
        });

        expect(() => tgpu.resolve([eq])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:eq: Comparison '===' requires numeric or boolean operands. Got 'struct:Boid' and 'struct:Boid'.]
        `);
        expect(() => tgpu.resolve([ne])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:ne: Comparison '!==' requires numeric or boolean operands. Got 'struct:Boid' and 'struct:Boid'.]
        `,
        );
        expect(() => tgpu.resolve([lt])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:lt: Comparison '<' requires numeric operands. Got 'struct:Boid' and 'struct:Boid'.]
        `,
        );
        expect(() => tgpu.resolve([le])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:le: Comparison '<=' requires numeric operands. Got 'struct:Boid' and 'struct:Boid'.]
        `,
        );
        expect(() => tgpu.resolve([gt])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:gt: Comparison '>' requires numeric operands. Got 'struct:Boid' and 'struct:Boid'.]
        `,
        );
        expect(() => tgpu.resolve([ge])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:ge: Comparison '>=' requires numeric operands. Got 'struct:Boid' and 'struct:Boid'.]
        `,
        );
      });

      it('when both operands are vectors suggests std function', () => {
        const x = d.vec3f();

        const f = tgpu.fn([d.vec3f])((y) => {
          'use gpu';
          return x === y;
        });

        expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:f: Comparison '===' requires numeric or boolean operands. Got 'vec3f' and 'vec3f'. For component-wise comparison, use 'std.eq'.]
        `);
      });
    });
  });

  describe('operator &&', () => {
    it('handles boolean operands', () => {
      const and = tgpu.fn(
        [d.bool, d.bool],
        d.bool,
      )((x, y) => {
        'use gpu';
        return x && y;
      });

      expect(tgpu.resolve([and])).toMatchInlineSnapshot(`
        "fn and(x: bool, y: bool) -> bool {
          return (x && y);
        }"
      `);
    });

    it('throws when both operands are not boolean', () => {
      const and = tgpu.fn(
        [d.u32, Boid],
        d.bool,
      )((x, y) => {
        'use gpu';
        return !!(x && y);
      });

      expect(() => tgpu.resolve([and])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:and: Logical expression '&&' requires boolean operands. Got 'u32' and 'struct:Boid'.]
      `);
    });
  });

  describe('operator ||', () => {
    it('handles boolean operands', () => {
      const or = tgpu.fn(
        [d.bool, d.bool],
        d.bool,
      )((x, y) => {
        'use gpu';
        return x || y;
      });

      expect(tgpu.resolve([or])).toMatchInlineSnapshot(`
        "fn or(x: bool, y: bool) -> bool {
          return (x || y);
        }"
      `);
    });

    it('throws when both operands are not boolean', () => {
      const or = tgpu.fn(
        [d.u32, Boid],
        d.bool,
      )((x, y) => {
        'use gpu';
        return !!(x || y);
      });

      expect(() => tgpu.resolve([or])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:or: Logical expression '||' requires boolean operands. Got 'u32' and 'struct:Boid'.]
      `);
    });
  });

  describe('short-circuit evaluation', () => {
    const state = { counter: 0, result: true };
    const getTrackedBool = tgpu.comptime(() => {
      state.counter++;
      return state.result;
    });
    beforeEach(() => {
      state.counter = 0;
      state.result = true;
    });

    it('handles ||', () => {
      const f = () => {
        'use gpu';
        let res = -1;
        // oxlint-disable-next-line(no-constant-binary-expression) -- part of the test
        if (true || getTrackedBool()) {
          res = 1;
        }
        return res;
      };

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f() -> i32 {
          var res = -1;
          {
            res = 1i;
          }
          return res;
        }"
      `);
      expect(state.counter).toBe(0);
    });

    it('handles chained ||', () => {
      state.result = false;

      const f = () => {
        'use gpu';
        let res = -1;
        // oxlint-disable-next-line(no-constant-binary-expression) -- part of the test
        if (getTrackedBool() || true || getTrackedBool() || getTrackedBool() || getTrackedBool()) {
          res = 1;
        }
        return res;
      };

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f() -> i32 {
          var res = -1;
          {
            res = 1i;
          }
          return res;
        }"
      `);
      expect(state.counter).toEqual(1);
    });

    it('skips false lhs', () => {
      const f = tgpu.fn(
        [d.bool],
        d.i32,
      )((b) => {
        'use gpu';
        let res = -1;
        // oxlint-disable-next-line(no-constant-binary-expression) -- part of the test
        if (false || b) {
          res = 1;
        }
        return res;
      });

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f(b: bool) -> i32 {
          var res = -1;
          if (b) {
            res = 1i;
          }
          return res;
        }"
      `);
    });

    it('throws when rhs cannot be converted to boolean', () => {
      const b = false;
      const f = tgpu.fn(
        [d.vec3f],
        d.bool,
      )((v) => {
        'use gpu';

        return !!(b || v);
      });

      expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:f: Cannot convert value of type 'vec3f' to any of the target types: [bool]]
      `);
    });

    it('handles &&', () => {
      const f = () => {
        'use gpu';
        let res = -1;
        // oxlint-disable-next-line(no-constant-binary-expression) -- part of the test
        if (false && getTrackedBool()) {
          res = 1;
        }
        return res;
      };

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f() -> i32 {
          let res = -1;
          return res;
        }"
      `);
      expect(state.counter).toBe(0);
    });

    it('handles chained &&', () => {
      const f = () => {
        'use gpu';
        let res = -1;
        // oxlint-disable-next-line(no-constant-binary-expression) -- part of the test
        if (getTrackedBool() && false && getTrackedBool() && getTrackedBool() && getTrackedBool()) {
          res = 1;
        }
        return res;
      };

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f() -> i32 {
          let res = -1;
          return res;
        }"
      `);
      expect(state.counter).toBe(1);
    });

    it('skips true lhs', () => {
      const f = tgpu.fn(
        [d.bool],
        d.i32,
      )((b) => {
        'use gpu';
        let res = -1;
        // oxlint-disable-next-line(no-constant-binary-expression) -- part of the test
        if (true && b) {
          res = 1;
        }
        return res;
      });

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f(b: bool) -> i32 {
          var res = -1;
          if (b) {
            res = 1i;
          }
          return res;
        }"
      `);
    });

    it('throws when rhs cannot be converted to boolean', () => {
      const b = true;
      const f = tgpu.fn(
        [d.vec3f],
        d.bool,
      )((v) => {
        'use gpu';

        return !!(b && v);
      });

      expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:f: Cannot convert value of type 'vec3f' to any of the target types: [bool]]
      `);
    });

    it('handles mixed operators', () => {
      const f = () => {
        'use gpu';
        let res = -1;
        // oxlint-disable-next-line(no-constant-binary-expression) -- part of the test
        if (true || (getTrackedBool() && getTrackedBool())) {
          res = 1;
        }
        return res;
      };

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f() -> i32 {
          var res = -1;
          {
            res = 1i;
          }
          return res;
        }"
      `);
      expect(state.counter).toBe(0);
    });
  });
});
