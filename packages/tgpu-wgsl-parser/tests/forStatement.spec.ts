import { describe, expect, it } from 'vitest';
import type { ForStatement } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('for_statement', () => {
  it('parses for loop with empty body', () => {
    expect(parse('for (var i = 0; i < 10; i += 1) {}')).toStrictEqual({
      type: 'for_statement',
      attrs: [],
      init: {
        type: 'variable_decl',
        ident: 'i',
        expr: {
          type: 'int_literal',
          value: '0',
        },
        template_list: null,
        typespec: null,
      },
      check: {
        type: 'less_than',
        lhs: {
          type: 'template_elaborated_ident',
          ident: 'i',
          template_list: null,
        },
        rhs: { type: 'int_literal', value: '10' },
      },
      update: {
        type: 'assignment_statement',
        lhs: {
          type: 'access_expr',
          expression: { type: 'ident', value: 'i' },
          accessor: null,
        },
        op: '+=',
        rhs: {
          type: 'int_literal',
          value: '1',
        },
      },
      body: [],
    } satisfies ForStatement);
  });
});
