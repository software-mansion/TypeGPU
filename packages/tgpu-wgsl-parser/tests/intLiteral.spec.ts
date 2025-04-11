import { describe, expect, it } from 'vitest';
import type { IntLiteral } from '../src/grammar';
import { parse } from '../src/index';

describe('int_literal', () => {
  it('parses decimal unsigned ints', () => {
    expect(parse('0u')).toEqual({
      type: 'int_literal',
      value: '0u',
    } satisfies IntLiteral);

    expect(parse('123u')).toEqual({
      type: 'int_literal',
      value: '123u',
    } satisfies IntLiteral);
  });

  it('parses decimal signed ints', () => {
    expect(parse('0')).toEqual({
      type: 'int_literal',
      value: '0',
    } satisfies IntLiteral);

    expect(parse('0i')).toEqual({
      type: 'int_literal',
      value: '0i',
    } satisfies IntLiteral);

    expect(parse('123')).toEqual({
      type: 'int_literal',
      value: '123',
    } satisfies IntLiteral);

    expect(parse('123i')).toEqual({
      type: 'int_literal',
      value: '123i',
    } satisfies IntLiteral);
  });
});
