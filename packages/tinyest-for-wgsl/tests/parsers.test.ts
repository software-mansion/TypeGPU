import babel from '@babel/parser';
import type { Node } from '@babel/types';
import * as acorn from 'acorn';
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

      expect(argNames).toEqual({
        type: 'identifiers',
        names: [],
      });
      expect(body).toEqual({ b: [] });
      expect(externalNames).toEqual([]);
    }),
  );

  it(
    'parses an empty named function',
    dualTest((p) => {
      const { argNames, body, externalNames } = transpileFn(
        p('function example() {}'),
      );

      expect(argNames).toEqual({
        type: 'identifiers',
        names: [],
      });
      expect(body).toEqual({ b: [] });
      expect(externalNames).toEqual([]);
    }),
  );

  it(
    'gathers external names',
    dualTest((p) => {
      const { argNames, body, externalNames } = transpileFn(
        p('(a, b) => a + b - c'),
      );

      expect(argNames).toEqual({
        type: 'identifiers',
        names: ['a', 'b'],
      });
      expect(body).toEqual({
        b: [{ r: { x: [{ x: ['a', '+', 'b'] }, '-', 'c'] } }],
      });
      expect(externalNames).toEqual(['c']);
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

      expect(argNames).toEqual({
        type: 'identifiers',
        names: [],
      });
      expect(body).toEqual({
        b: [
          { c: ['a', { n: '0' }] },
          { x: ['c', '=', { x: ['a', '+', { n: '2' }] }] },
        ],
      });
      // Only 'c' is external, as 'a' is declared in the same scope.
      expect(externalNames).toEqual(['c']);
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

      expect(argNames).toEqual({
        type: 'identifiers',
        names: [],
      });
      expect(body).toEqual({
        b: [
          { c: ['a', { n: '0' }] },
          { b: [{ x: ['c', '=', { x: ['a', '+', { n: '2' }] }] }] },
        ],
      });
      // Only 'c' is external, as 'a' is declared in the outer scope.
      expect(externalNames).toEqual(['c']);
    }),
  );

  it(
    'treats the object as a possible external value when accessing a member',
    dualTest((p) => {
      const { argNames, body, externalNames } = transpileFn(
        p('() => external.outside.prop'),
      );

      expect(argNames).toEqual({
        type: 'identifiers',
        names: [],
      });
      expect(body).toEqual({
        b: [{ r: { a: [{ a: ['external', 'outside'] }, 'prop'] } }],
      });
      // Only 'external' is external.
      expect(externalNames).toEqual(['external']);
    }),
  );
});
