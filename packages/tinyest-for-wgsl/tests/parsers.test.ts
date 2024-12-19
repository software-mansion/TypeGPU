import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { transpileFn } from '../src/parsers';

const p = (code: string) => parse(code, { ecmaVersion: 'latest' });

describe('transpileFn', () => {
  it('fails when the input is not a function', () => {
    expect(() => transpileFn(p('1 + 2'))).toThrow();
  });

  it('parses an empty arrow function', () => {
    const { argNames, body, externalNames } = transpileFn(p('() => {}'));

    expect(argNames).toEqual([]);
    expect(body).toEqual({ b: [] });
    expect(externalNames).toEqual([]);
  });

  it('parses an empty named function', () => {
    const { argNames, body, externalNames } = transpileFn(
      p('function example() {}'),
    );

    expect(argNames).toEqual([]);
    expect(body).toEqual({ b: [] });
    expect(externalNames).toEqual([]);
  });

  it('gathers external names', () => {
    const { argNames, body, externalNames } = transpileFn(
      p('(a, b) => a + b - c'),
    );

    expect(argNames).toEqual(['a', 'b']);
    expect(body).toEqual({
      b: [{ r: { x: [{ x: ['a', '+', 'b'] }, '-', 'c'] } }],
    });
    expect(externalNames).toEqual(['c']);
  });

  it('respects local declarations when gathering external names', () => {
    const { argNames, body, externalNames } = transpileFn(
      p(`() => {
        const a = 0;
        c = a + 2;
      }`),
    );

    expect(argNames).toEqual([]);
    expect(body).toEqual({
      b: [
        { c: ['a', { n: '0' }] },
        { x: ['c', '=', { x: ['a', '+', { n: '2' }] }] },
      ],
    });
    // Only 'c' is external, as 'a' is declared in the same scope.
    expect(externalNames).toEqual(['c']);
  });

  it('respects outer scope when gathering external names', () => {
    const { argNames, body, externalNames } = transpileFn(
      p(`() => {
        const a = 0;
        {
          c = a + 2;
        }
      }`),
    );

    expect(argNames).toEqual([]);
    expect(body).toEqual({
      b: [
        { c: ['a', { n: '0' }] },
        { b: [{ x: ['c', '=', { x: ['a', '+', { n: '2' }] }] }] },
      ],
    });
    // Only 'c' is external, as 'a' is declared in the outer scope.
    expect(externalNames).toEqual(['c']);
  });

  it('treats the object as a possible external value when accessing a member', () => {
    const { argNames, body, externalNames } = transpileFn(
      p('() => external.outside.prop'),
    );

    expect(argNames).toEqual([]);
    expect(body).toEqual({
      b: [{ r: { a: [{ a: ['external', 'outside'] }, 'prop'] } }],
    });
    // Only 'external' is external.
    expect(externalNames).toEqual(['external']);
  });
});
