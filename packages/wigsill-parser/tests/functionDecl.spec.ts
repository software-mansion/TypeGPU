import { describe, expect, it } from 'vitest';
import type { TranslationUnit } from '../src/grammar';
import { parse } from '../src/index';

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
          type: 'function_decl' as const,
          attrs: [],
          header: {
            type: 'function_header' as const,
            identifier: 'example' as const,
          },
          body: [],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toEqual(expected);
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
          type: 'function_decl' as const,
          attrs: [],
          header: {
            type: 'function_header' as const,
            identifier: 'example' as const,
          },
          body: [
            {
              type: 'return_statement' as const,
              expression: null,
            },
          ],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toEqual(expected);
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
          type: 'function_decl' as const,
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
            type: 'function_header' as const,
            identifier: 'example' as const,
          },
          body: [
            {
              type: 'return_statement' as const,
              expression: null,
            },
          ],
        },
      ],
    } satisfies TranslationUnit;

    expect(parse(code)).toEqual(expected);
  });
});
