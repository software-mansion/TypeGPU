import { describe, expect, it } from 'vitest';
import type { ReturnStatement } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('return_statement', () => {
  it('parses empty return', () => {
    expect(parse('return;')).toStrictEqual({
      type: 'return_statement',
      expression: null,
    } satisfies ReturnStatement);
  });

  it('parses return of literal', () => {
    expect(parse('return 123;')).toStrictEqual({
      type: 'return_statement',
      expression: {
        type: 'int_literal',
        value: '123',
      },
    } satisfies ReturnStatement);
  });

  it('parses return of math operation', () => {
    expect(parse('return 10. * 0.5;')).toStrictEqual({
      type: 'return_statement',
      expression: {
        type: 'multiply',
        lhs: { type: 'float_literal', value: '10.' },
        rhs: { type: 'float_literal', value: '0.5' },
      },
    } satisfies ReturnStatement);
  });
});
