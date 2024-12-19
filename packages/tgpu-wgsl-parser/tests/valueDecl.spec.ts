import { describe, expect, it } from 'vitest';
import type { ValueDecl } from '../src/grammar';
import { parse } from '../src/index';

describe('value_decl', () => {
  it('parses non-typed', () => {
    expect(parse('const example = 123;')).toEqual({
      type: 'value_decl',
      ident: 'example',
      typespec: null,
      expr: {
        type: 'int_literal',
        value: '123',
      },
    } satisfies ValueDecl);
  });

  it('parses typed', () => {
    expect(parse('const example: i32 = 123;')).toEqual({
      type: 'value_decl',
      ident: 'example',
      typespec: {
        type: 'template_elaborated_ident',
        ident: 'i32',
        template_list: null,
      },
      expr: {
        type: 'int_literal',
        value: '123',
      },
    } satisfies ValueDecl);
  });
});
