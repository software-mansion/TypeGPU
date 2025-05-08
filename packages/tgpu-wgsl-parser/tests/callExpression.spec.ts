import { describe, expect, it } from 'vitest';
import type { CallExpression } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('call_expression', () => {
  it('parses function call with no args', () => {
    const expected = {
      type: 'call_expression',
      ident: {
        type: 'template_elaborated_ident',
        ident: 'perform',
        template_list: null,
      },
      args: [],
    } satisfies CallExpression;

    expect(parse('perform()')).toStrictEqual(expected);
  });

  it('parses function call with one arg', () => {
    const expected = {
      type: 'call_expression',
      ident: {
        type: 'template_elaborated_ident',
        ident: 'perform',
        template_list: null,
      },
      args: [
        {
          type: 'bool_literal',
          value: 'true',
        },
      ],
    } satisfies CallExpression;

    expect(parse('perform(true)')).toStrictEqual(expected);
  });

  it('parses function call with two args', () => {
    const expected = {
      type: 'call_expression',
      ident: {
        type: 'template_elaborated_ident',
        ident: 'perform',
        template_list: null,
      },
      args: [
        {
          type: 'bool_literal',
          value: 'true',
        },
        {
          type: 'float_literal',
          value: '0.15',
        },
      ],
    } satisfies CallExpression;

    expect(parse('perform(true, 0.15)')).toStrictEqual(expected);
  });
});
