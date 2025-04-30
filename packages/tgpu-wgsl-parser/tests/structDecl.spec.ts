import { describe, expect, it } from 'vitest';
import type { StructDecl, StructMember } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('struct_decl', () => {
  it('parses struct with simple members', () => {
    expect(parse('struct Gradient { from: vec3f, to: vec3f, };')).toStrictEqual(
      {
        declarations: [
          {
            type: 'struct_decl',
            ident: 'Gradient',
            members: [
              {
                type: 'struct_member',
                ident: 'from',
                attrs: [],
                typespec: {
                  type: 'template_elaborated_ident',
                  ident: 'vec3f',
                  template_list: null,
                },
              } satisfies StructMember,
              {
                type: 'struct_member',
                ident: 'to',
                attrs: [],
                typespec: {
                  type: 'template_elaborated_ident',
                  ident: 'vec3f',
                  template_list: null,
                },
              } satisfies StructMember,
            ],
          } satisfies StructDecl,
          null,
        ],
        type: 'translation_unit',
      },
    );
  });

  it('parses struct with members with attributes', () => {
    expect(
      parse('struct Gradient { @size(32) from: vec3f, to: vec3f }'),
    ).toStrictEqual({
      declarations: [
        {
          type: 'struct_decl',
          ident: 'Gradient',
          members: [
            {
              type: 'struct_member',
              ident: 'from',
              attrs: [
                {
                  type: 'attribute',
                  ident: 'size',
                  args: [{ type: 'int_literal', value: '32' }],
                },
              ],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'vec3f',
                template_list: null,
              },
            } satisfies StructMember,
            {
              type: 'struct_member',
              ident: 'to',
              attrs: [],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'vec3f',
                template_list: null,
              },
            } satisfies StructMember,
          ],
        } satisfies StructDecl,
      ],
      type: 'translation_unit',
    });
  });

  it('parses struct with members with attributes and template list', () => {
    expect(
      parse(
        'struct Gradient { @size(32) from: vec2<f32>, @align(32) to: vec3f }',
      ),
    ).toStrictEqual({
      declarations: [
        {
          type: 'struct_decl',
          ident: 'Gradient',
          members: [
            {
              type: 'struct_member',
              ident: 'from',
              attrs: [
                {
                  type: 'attribute',
                  ident: 'size',
                  args: [{ type: 'int_literal', value: '32' }],
                },
              ],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'vec2',
                template_list: [
                  {
                    type: 'template_elaborated_ident',
                    ident: 'f32',
                    template_list: null,
                  },
                ],
              },
            } satisfies StructMember,
            {
              type: 'struct_member',
              ident: 'to',
              attrs: [
                {
                  type: 'attribute',
                  ident: 'align',
                  args: [{ type: 'int_literal', value: '32' }],
                },
              ],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'vec3f',
                template_list: null,
              },
            } satisfies StructMember,
          ],
        } satisfies StructDecl,
      ],
      type: 'translation_unit',
    });
  });

  it('parses nested struct', () => {
    expect(
      parse(
        'struct Gradient { from: vec3f, to: vec3f, }; struct Material { color: vec3f, gradient: Gradient, };',
      ),
    ).toStrictEqual({
      declarations: [
        {
          type: 'struct_decl',
          ident: 'Gradient',
          members: [
            {
              type: 'struct_member',
              ident: 'from',
              attrs: [],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'vec3f',
                template_list: null,
              },
            } satisfies StructMember,
            {
              type: 'struct_member',
              ident: 'to',
              attrs: [],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'vec3f',
                template_list: null,
              },
            } satisfies StructMember,
          ],
        } satisfies StructDecl,
        null,
        {
          type: 'struct_decl',
          ident: 'Material',
          members: [
            {
              type: 'struct_member',
              ident: 'color',
              attrs: [],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'vec3f',
                template_list: null,
              },
            } satisfies StructMember,
            {
              type: 'struct_member',
              ident: 'gradient',
              attrs: [],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'Gradient',
                template_list: null,
              },
            } satisfies StructMember,
          ],
        } satisfies StructDecl,
        null,
      ],
      type: 'translation_unit',
    });
  });
});
