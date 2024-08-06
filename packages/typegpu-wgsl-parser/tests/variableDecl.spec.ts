import { describe, expect, it } from 'vitest';
import type { GlobalVariableDecl, VariableDecl } from '../src/grammar';
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

describe('global_variable_decl', () => {
  it('parses a buffer', () => {
    expect(parse('@group(0) @binding(0) var<storage, read> buf: u32;')).toEqual(
      {
        declarations: [
          {
            type: 'global_variable_decl',
            attributes: [
              {
                type: 'attribute',
                ident: 'group',
                args: [
                  {
                    type: 'int_literal',
                    value: '0',
                  },
                ],
              },
              {
                type: 'attribute',
                ident: 'binding',
                args: [
                  {
                    type: 'int_literal',
                    value: '0',
                  },
                ],
              },
            ],
            variable_decl: {
              type: 'variable_decl',
              ident: 'buf',
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'u32',
                template_list: null,
              },
              expr: null,
              template_list: [
                {
                  type: 'template_elaborated_ident',
                  ident: 'storage',
                  template_list: null,
                },
                {
                  type: 'template_elaborated_ident',
                  ident: 'read',
                  template_list: null,
                },
              ],
            },
          } satisfies GlobalVariableDecl,
        ],
        type: 'translation_unit',
      },
    );
  });

  it('parses a texture', () => {
    expect(parse('@group(0) @binding(0) var tex: texture_2d<f32>;')).toEqual({
      declarations: [
        {
          type: 'global_variable_decl',
          attributes: [
            {
              type: 'attribute',
              ident: 'group',
              args: [
                {
                  type: 'int_literal',
                  value: '0',
                },
              ],
            },
            {
              type: 'attribute',
              ident: 'binding',
              args: [
                {
                  type: 'int_literal',
                  value: '0',
                },
              ],
            },
          ],
          variable_decl: {
            type: 'variable_decl',
            ident: 'tex',
            typespec: {
              type: 'template_elaborated_ident',
              ident: 'texture_2d',
              template_list: [
                {
                  type: 'template_elaborated_ident',
                  ident: 'f32',
                  template_list: null,
                },
              ],
            },
            expr: null,
            template_list: null,
          },
        } satisfies GlobalVariableDecl,
      ],
      type: 'translation_unit',
    });

    expect(
      parse(
        '@group(0) @binding(0) var tex: texture_storage_2d<rgba8unorm, write>;',
      ),
    ).toEqual({
      declarations: [
        {
          type: 'global_variable_decl',
          attributes: [
            {
              type: 'attribute',
              ident: 'group',
              args: [
                {
                  type: 'int_literal',
                  value: '0',
                },
              ],
            },
            {
              type: 'attribute',
              ident: 'binding',
              args: [
                {
                  type: 'int_literal',
                  value: '0',
                },
              ],
            },
          ],
          variable_decl: {
            type: 'variable_decl',
            ident: 'tex',
            typespec: {
              type: 'template_elaborated_ident',
              ident: 'texture_storage_2d',
              template_list: [
                {
                  type: 'template_elaborated_ident',
                  ident: 'rgba8unorm',
                  template_list: null,
                },
                {
                  type: 'template_elaborated_ident',
                  ident: 'write',
                  template_list: null,
                },
              ],
            },
            expr: null,
            template_list: null,
          },
        } satisfies GlobalVariableDecl,
      ],
      type: 'translation_unit',
    });
  });
});
