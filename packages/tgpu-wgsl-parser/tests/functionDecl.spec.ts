import { describe, expect, it } from 'vitest';
import type { TranslationUnit } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('function_decl', () => {
  it('parses empty function', () => {
    const code = `
      fn example() {
      }
    `;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl',
          attrs: [],
          header: {
            type: 'function_header',
            ident: 'example',
            returntype: null,
            args: null,
          },
          body: [],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toStrictEqual(expected);
  });

  it('parses function with one statement', () => {
    const code = `
      fn example() {
        return;
      }
    `;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl',
          attrs: [],
          header: {
            type: 'function_header',
            ident: 'example',
            returntype: null,
            args: null,
          },
          body: [
            {
              type: 'return_statement',
              expression: null,
            },
          ],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toStrictEqual(expected);
  });

  it('parses function with attributes', () => {
    const code = `
      @compute @attr1(0.5) @attr2(true, 123)
      fn example() {
        return;
      }
    `;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl',
          attrs: [
            { type: 'attribute', ident: 'compute', args: [] },
            {
              type: 'attribute',
              ident: 'attr1',
              args: [{ type: 'float_literal', value: '0.5' }],
            },
            {
              type: 'attribute',
              ident: 'attr2',
              args: [
                { type: 'bool_literal', value: 'true' },
                { type: 'int_literal', value: '123' },
              ],
            },
          ],
          header: {
            type: 'function_header',
            ident: 'example',
            returntype: null,
            args: null,
          },
          body: [
            {
              type: 'return_statement',
              expression: null,
            },
          ],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toStrictEqual(expected);
  });

  it('parses function with explicit return type', () => {
    const code = `
      fn example() -> u32 {
        return;
      }
    `;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl',
          attrs: [],
          header: {
            type: 'function_header',
            ident: 'example',
            returntype: {
              type: 'return_type',
              attrs: [],
              typespec: {
                type: 'template_elaborated_ident',
                ident: 'u32',
                template_list: null,
              },
            },
            args: null,
          },
          body: [
            {
              type: 'return_statement',
              expression: null,
            },
          ],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toStrictEqual(expected);
  });

  it('parses function with arguments', () => {
    const code = `
      fn example(x: u32, y: vec3f) {
        return;
      }
    `;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl',
          attrs: [],
          header: {
            type: 'function_header',
            ident: 'example',
            returntype: null,
            args: [
              {
                type: 'func_argument',
                ident: 'x',
                typespec: {
                  type: 'template_elaborated_ident',
                  ident: 'u32',
                  template_list: null,
                },
              },
              {
                type: 'func_argument',
                ident: 'y',
                typespec: {
                  type: 'template_elaborated_ident',
                  ident: 'vec3f',
                  template_list: null,
                },
              },
            ],
          },
          body: [
            {
              type: 'return_statement',
              expression: null,
            },
          ],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toStrictEqual(expected);
  });
});
