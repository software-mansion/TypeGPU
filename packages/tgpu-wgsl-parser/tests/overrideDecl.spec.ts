import { describe, expect, it } from 'vitest';
import type { TranslationUnit } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('override_decl', () => {
  it('parses untyped, unassigned', () => {
    expect(parse('override example;')).toEqual({
      type: 'translation_unit',
      declarations: [
        {
          type: 'override_decl',
          attrs: [],
          ident: 'example',
          typespec: null,
          expr: null,
        },
      ],
    } satisfies TranslationUnit);
  });

  it('parses typed, unassigned', () => {
    expect(parse('override example: u32;')).toEqual({
      type: 'translation_unit',
      declarations: [
        {
          type: 'override_decl',
          attrs: [],
          ident: 'example',
          typespec: {
            type: 'template_elaborated_ident',
            ident: 'u32',
            template_list: null,
          },
          expr: null,
        },
      ],
    } satisfies TranslationUnit);
  });

  it('parses typed, assigned', () => {
    expect(parse('override example: u32 = 123;')).toEqual({
      type: 'translation_unit',
      declarations: [
        {
          type: 'override_decl',
          attrs: [],
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
        },
      ],
    } satisfies TranslationUnit);
  });
});
