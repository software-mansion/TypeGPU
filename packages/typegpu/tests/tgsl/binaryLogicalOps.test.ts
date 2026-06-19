import { expect, describe } from 'vitest';
import { it } from 'typegpu-testing-utility';
import tgpu, { d } from '../../src/index.js';

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

      it('equality check handles non numeric operands', () => {
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

    describe.skip('runtime', () => {
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

      it('throws when both operands are not numeric', () => {
        const xAccessor = tgpu.accessor(Boid, () => Boid());

        const eq = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ === y;
        });
        const ne = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ !== y;
        });
        const lt = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ < y;
        });
        const le = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ <= y;
        });
        const gt = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ > y;
        });
        const ge = tgpu.fn([BoidOnSteroids])((y) => {
          'use gpu';
          const _r = xAccessor.$ >= y;
        });

        expect(() => tgpu.resolve([eq])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:eq: Comparison '===' requires numeric operands. Got 'struct:Boid' and 'struct:BoidOnSteroids'.]
        `);
        expect(() => tgpu.resolve([ne])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:ne: Comparison '!==' requires numeric operands. Got 'struct:Boid' and 'struct:BoidOnSteroids'.]
        `,
        );
        expect(() => tgpu.resolve([lt])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:lt: Comparison '<' requires numeric operands. Got 'struct:Boid' and 'struct:BoidOnSteroids'.]
        `,
        );
        expect(() => tgpu.resolve([le])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:le: Comparison '<=' requires numeric operands. Got 'struct:Boid' and 'struct:BoidOnSteroids'.]
        `,
        );
        expect(() => tgpu.resolve([gt])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:gt: Comparison '>' requires numeric operands. Got 'struct:Boid' and 'struct:BoidOnSteroids'.]
        `,
        );
        expect(() => tgpu.resolve([ge])).toThrowErrorMatchingInlineSnapshot(
          `
          [Error: Resolution of the following tree failed:
          - <root>
          - fn:ge: Comparison '>=' requires numeric operands. Got 'struct:Boid' and 'struct:BoidOnSteroids'.]
        `,
        );
      });

      it('when both operands are vectors suggests std function', () => {
        const x = d.vec3f();
        const y = x;

        const f = () => {
          'use gpu';
          return x === y;
        };

        expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
          [Error: Resolution of the following tree failed:
          - <root>
          - fn*:f
          - fn*:f(): Comparison '===' requires numeric operands. For component-wise comparison, use 'std.eq''.]
        `);
      });
    });
  });
});
