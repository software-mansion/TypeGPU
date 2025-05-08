import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';
import type { ArgNames } from 'tinyest';
import { describe, expect, it } from 'vitest';
import { transpileFn } from '../src/parsers.ts';

const parseRollup = (code: string) =>
  acorn.parse(code, { ecmaVersion: 'latest' });
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
      const { argNames, body, externalNames } = transpileFn(p('() => {}'));

      expect(argNames).toStrictEqual({
        type: 'identifiers',
        names: [],
      });
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[]]"`);
      expect(externalNames).toStrictEqual([]);
    }),
  );

  it(
    'parses an empty named function',
    dualTest((p) => {
      const { argNames, body, externalNames } = transpileFn(
        p('function example() {}'),
      );

      expect(argNames).toStrictEqual({
        type: 'identifiers',
        names: [],
      });
      expect(JSON.stringify(body)).toMatchInlineSnapshot(`"[0,[]]"`);
      expect(externalNames).toStrictEqual([]);
    }),
  );

  it(
    'gathers external names',
    dualTest((p) => {
      const { argNames, body, externalNames } = transpileFn(
        p('(a, b) => a + b - c'),
      );

      expect(argNames).toStrictEqual({
        type: 'identifiers',
        names: ['a', 'b'],
      });
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[10,[1,[1,"a","+","b"],"-","c"]]]]"`,
      );
      expect(externalNames).toStrictEqual(['c']);
    }),
  );

  it(
    'respects local declarations when gathering external names',
    dualTest((p) => {
      const { argNames, body, externalNames } = transpileFn(
        p(`() => {
        const a = 0;
        c = a + 2;
      }`),
      );

      expect(argNames).toStrictEqual({
        type: 'identifiers',
        names: [],
      });
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
      const { argNames, body, externalNames } = transpileFn(
        p(`() => {
        const a = 0;
        {
          c = a + 2;
        }
      }`),
      );

      expect(argNames).toStrictEqual({
        type: 'identifiers',
        names: [],
      });
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
      const { argNames, body, externalNames } = transpileFn(
        p('() => external.outside.prop'),
      );

      expect(argNames).toStrictEqual({
        type: 'identifiers',
        names: [],
      });
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
      const { argNames, externalNames } = transpileFn(
        p(`({ pos, a: b }) => {
          const x = pos.x;
        }`),
      );

      expect(argNames).toStrictEqual(
        {
          type: 'destructured-object',
          props: [
            {
              alias: 'pos',
              prop: 'pos',
            },
            {
              alias: 'b',
              prop: 'a',
            },
          ],
        } satisfies ArgNames,
      );

      expect(externalNames).toStrictEqual([]);
    }),
  );
});
