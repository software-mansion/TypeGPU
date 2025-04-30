import { describe, expect, it } from 'vitest';
import type { IntLiteral } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('int_literal', () => {
  it('parses decimal unsigned ints', () => {
    expect(parse('0u')).toStrictEqual({
      type: 'int_literal',
      value: '0u',
    } satisfies IntLiteral);

    expect(parse('123u')).toStrictEqual({
      type: 'int_literal',
      value: '123u',
    } satisfies IntLiteral);
  });

  it('parses decimal signed ints', () => {
    expect(parse('0')).toStrictEqual({
      type: 'int_literal',
      value: '0',
    } satisfies IntLiteral);

    expect(parse('0i')).toStrictEqual({
      type: 'int_literal',
      value: '0i',
    } satisfies IntLiteral);

    expect(parse('123')).toStrictEqual({
      type: 'int_literal',
      value: '123',
    } satisfies IntLiteral);

    expect(parse('123i')).toStrictEqual({
      type: 'int_literal',
      value: '123i',
    } satisfies IntLiteral);
  });
});
