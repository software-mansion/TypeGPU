import { expect, it } from 'vitest';
import { parse } from './index';

it('parses empty function', () => {
  const code = `fn example() {
  }`;

  const expected = {
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
