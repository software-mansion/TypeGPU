import { describe, expect, it } from 'vitest';
import { TranslationUnit } from '../src/grammar';
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

  it('parses function with attribute', () => {
    const code = `
      @compute
      fn example() {
        return;
      }
    `;

    const expected = {
      type: 'translation_unit',
      declarations: [
        {
          type: 'function_decl' as const,
          attrs: [{ type: 'attribute', ident: 'compute', args: [] }],
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
