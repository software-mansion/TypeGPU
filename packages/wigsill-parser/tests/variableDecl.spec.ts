import { describe, expect, it } from 'vitest';
import type { VariableDecl } from '../src/grammar';
import { parse } from '../src/index';

describe('variable_decl', () => {
  it('parses unassigned', () => {
    expect(parse('var example: u32;')).toEqual({
      type: 'variable_decl',
      ident: 'example',
      typespec: {
        type: 'template_elaborated_ident',
        ident: 'u32',
        template_list: null,
      },
      expr: null,
      template_list: null,
    } satisfies VariableDecl);
  });

  it('parses assigned', () => {
    expect(parse('var example: u32 = 123;')).toEqual({
      type: 'variable_decl',
      ident: 'example',
      typespec: {
        type: 'template_elaborated_ident',
        ident: 'u32',
        template_list: null,
      },
      expr: {
        type: 'int_literal',
        value: '123',
      },
      template_list: null,
    } satisfies VariableDecl);
  });
});
