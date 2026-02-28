import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';
import { describe, expect, it } from 'vitest';
import { transpileFn } from '../src/parsers.ts';

const parseRollup = (code: string) => acorn.parse(code, { ecmaVersion: 'latest' });
const parseBabel = (code: string) =>
  babel.parse(code, { sourceType: 'module' }).program.body[0] as Node;

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
      expect(externalNames).toStrictEqual([]);
    }),
  );

  it(
    'parses an empty named function',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(p('function example() {}'));

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[]]"`);
      expect(externalNames).toStrictEqual([]);
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
      expect(externalNames).toStrictEqual(['c']);
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
      expect(externalNames).toStrictEqual(['c']);
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
      expect(externalNames).toStrictEqual(['c']);
    }),
  );

  it(
    'treats the object as a possible external value when accessing a member',
    dualTest((p) => {
      const { params, body, externalNames } = transpileFn(p('() => external.outside.prop'));

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[7,[7,"external","outside"],"prop"]]]]"`,
      );
      // Only 'external' is external.
      expect(externalNames).toStrictEqual(['external']);
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

      expect(externalNames).toStrictEqual([]);
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

      expect(externalNames).toStrictEqual([]);
    }),
  );
});
