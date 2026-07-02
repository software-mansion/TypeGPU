import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';
import { describe, expect, it } from 'vitest';
import { transpileFn } from '../src/parsers.ts';

const parseRollup = (code: string) => acorn.parse(code, { ecmaVersion: 'latest' });
const parseBabel = (code: string) =>
  babel.parse(code, { sourceType: 'module', plugins: ['typescript'] }).program.body[0] as Node;

function dualTest(test: (p: (code: string) => Node | acorn.AnyNode) => void) {
  return () => {
    test(parseBabel);
    test(parseRollup);
  };
}

describe('transpileFn', () => {
  it(
    'fails when the input is not a function',
    dualTest((p) => {
      expect(() => transpileFn(p('1 + 2'))).toThrow();
    }),
  );

  it(
    'parses an empty arrow function',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(p('() => {}'));

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[]]"`);
      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
    }),
  );

  it(
    'parses an empty named function',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(p('function example() {}'));

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[]]"`);
      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
    }),
  );

  it(
    'gathers external names',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(p('(a, b) => a + b - c'));

      expect(params).toStrictEqual([
        { type: 'i', name: 'a' },
        { type: 'i', name: 'b' },
      ]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[1,[1,"a","+","b"],"-","c"]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "c",
        }
      `);
    }),
  );

  it(
    'respects local declarations when gathering external names',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
        const a = 0;
        c = a + 2;
      }`),
      );

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"a",[5,"0"]],[2,"c","=",[1,"a","+",[5,"2"]]]]]"`,
      );
      // Only 'c' is external, as 'a' is declared in the same scope.
      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "c",
        }
      `);
    }),
  );

  it(
    'respects outer scope when gathering external names',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(
        p(`() => {
        const a = 0;
        {
          c = a + 2;
        }
      }`),
      );

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"a",[5,"0"]],[0,[[2,"c","=",[1,"a","+",[5,"2"]]]]]]]"`,
      );
      // Only 'c' is external, as 'a' is declared in the outer scope.
      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "c",
        }
      `);
    }),
  );

  it(
    'treats the object as a possible external value when accessing a member',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(p('() => external.outside.prop'));

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[10,"external.outside.prop"]]]"`);
      // Only 'external' is external.
      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "external.outside.prop",
        }
      `);
    }),
  );

  it(
    'handles destructured args',
    dualTest((p) => {
      const { params, externalNames } = transpileFn(
        p(`({ pos, a: b }) => {
          const x = pos.x;
        }`),
      );

      expect(params).toStrictEqual([
        {
          type: 'd',
          props: [
            {
              alias: 'pos',
              name: 'pos',
            },
            {
              alias: 'b',
              name: 'a',
            },
          ],
        },
      ]);

      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
    }),
  );

  it(
    'handles mixed type parameters',
    dualTest((p) => {
      const { params, externalNames } = transpileFn(
        p(`(y, { pos, a: b }, {c, d}) => {
          const x = pos.x;
        }`),
      );

      expect(params).toStrictEqual([
        {
          type: 'i',
          name: 'y',
        },
        {
          type: 'd',
          props: [
            {
              alias: 'pos',
              name: 'pos',
            },
            {
              alias: 'b',
              name: 'a',
            },
          ],
        },
        {
          type: 'd',
          props: [
            {
              alias: 'c',
              name: 'c',
            },
            {
              alias: 'd',
              name: 'd',
            },
          ],
        },
      ]);

      expect(externalNames).toMatchInlineSnapshot(`Set {}`);
    }),
  );

  it('handles TSNonNullExpression', () => {
    const { body } = transpileFn(parseBabel('() => x!.y'));

    expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[[10,[7,"x","y"]]]]"`);
  });

  it(
    'handles complex external trees',
    dualTest((p) => {
      const { externalNames, body } = transpileFn(
        p(`() => {
          const a = ext.p;

          const b = ext.q.a;
          const c = ext.q.b;

          const d = ext.r.a;
          const e = ext.r;

          const f = ext.s;
          const g = ext.s.a;

          const h = ext.t.fn().x;
          const i = ext.t.comp['computed'].x;
          const j = ext.t;

          const k = (ext).u;

          const l = ext;
        }`),
      );

      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "ext.p",
          "ext.q.a",
          "ext.q.b",
          "ext.r.a",
          "ext.r",
          "ext.s",
          "ext.s.a",
          "ext.t.fn",
          "ext.t.comp",
          "ext.t",
          "ext.u",
          "ext",
        }
      `);

      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"a","ext.p"],[13,"b","ext.q.a"],[13,"c","ext.q.b"],[13,"d","ext.r.a"],[13,"e","ext.r"],[13,"f","ext.s"],[13,"g","ext.s.a"],[13,"h",[7,[6,"ext.t.fn",[]],"x"]],[13,"i",[7,[8,"ext.t.comp",[103,"computed"]],"x"]],[13,"j","ext.t"],[13,"k","ext.u"],[13,"l","ext"]]]"`,
      );
    }),
  );

  it(
    'does not duplicate externals',
    dualTest((p) => {
      const { externalNames } = transpileFn(
        p(`() => {
          const a = ext;
          const b = ext;
        }`),
      );

      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "ext",
        }
      `);
    }),
  );

  it(
    'does not prune externals when they reappear',
    dualTest((p) => {
      const { externalNames, body } = transpileFn(
        p(`() => {
          const a = ext.value;
          const b = ext.config.multiplier;
          const c = ext.config.zero;
          const d = ext.config.multiplier;
        };`),
      );

      expect(externalNames).toMatchInlineSnapshot(`
        Set {
          "ext.value",
          "ext.config.multiplier",
          "ext.config.zero",
        }
      `);

      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"a","ext.value"],[13,"b","ext.config.multiplier"],[13,"c","ext.config.zero"],[13,"d","ext.config.multiplier"]]]"`,
      );
    }),
  );
});
