import { describe, expect, it } from 'vitest';
import type { FuncCallStatement } from './grammar';
import { parse } from './index';

describe('function call statement', () => {
  it('parses function call with no args', () => {
    const expected = {
      type: 'call_statement',
      ident: {
        type: 'template_elaborated_ident',
        value: 'perform',
        template_list: null,
      },
      args: [],
    } satisfies FuncCallStatement;

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
    } satisfies FuncCallStatement;

    expect(parse('perform(true);')).toEqual(expected);
  });
});

describe('function declaration', () => {
  it('parses empty function', () => {
    const code = `fn example() {
    }`;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl' as const,
          header: {
            type: 'function_header' as const,
            identifier: 'example' as const,
          },
          body: [],
        },
      ],
    };

    expect(parse(code)).toEqual(expected);
  });

  it('parses function with one statement', () => {
    const code = `fn example() {
    if true {}
  }`;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl' as const,
          header: {
            type: 'function_header' as const,
            identifier: 'example' as const,
          },
          body: [
            {
              type: 'if_statement' as const,
              if_clause: {
                type: 'if_clause' as const,
                expression: {
                  type: 'bool_literal' as const,
                  value: 'true' as const,
                },
                body: [],
              },
              else_if_clauses: [],
              else_clause: null,
            },
          ],
        },
      ],
    };

    expect(parse(code)).toEqual(expected);
  });
});
