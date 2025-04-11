import { describe, expect, it } from 'vitest';
import type { CallStatement } from '../src/grammar';
import { parse } from '../src/index';

describe('call_statement', () => {
  it('parses function call with no args', () => {
    const expected = {
      type: 'call_statement',
      ident: {
        type: 'template_elaborated_ident',
        ident: 'perform',
        template_list: null,
      },
      args: [],
    } satisfies CallStatement;

    expect(parse('perform();')).toEqual(expected);
  });

  it('parses function call with one arg', () => {
    const expected = {
      type: 'call_statement',
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
    } satisfies CallStatement;

    expect(parse('perform(true);')).toEqual(expected);
  });

  it('parses function call with two args', () => {
    const expected = {
      type: 'call_statement',
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
    } satisfies CallStatement;

    expect(parse('perform(true, 0.15);')).toEqual(expected);
  });
});
