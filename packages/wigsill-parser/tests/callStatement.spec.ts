import { describe, expect, it } from 'vitest';
import type { CallStatement } from '../src/grammar';
import { parse } from '../src/index';

describe('call_statement', () => {
  it('parses function call with no args', () => {
    const expected = {
      type: 'call_statement',
      ident: {
        type: 'template_elaborated_ident',
        value: 'perform',
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
        value: 'perform',
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
});
