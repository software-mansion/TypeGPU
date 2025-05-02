import { describe, expect, it } from 'vitest';
import type { FloatLiteral } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('float_literal', () => {
  const EXAMPLE_FLOAT_LITERALS = [
    // decimal
    '0.e+4f',
    '01.',
    '.01',
    '12.34',
    '.0f',
    '0h',
    '1e-3',
    // hex
    '0xa.fp+2',
    '0x1P+4f',
    '0X.3',
    '0x3p+2h',
    '0X1.fp-4',
    '0x3.2p+2h',
  ];

  it('parses float', () => {
    for (const exampleFloat of EXAMPLE_FLOAT_LITERALS) {
      expect(parse(exampleFloat)).toEqual(
        {
          type: 'float_literal',
          value: exampleFloat,
        } satisfies FloatLiteral,
      );
    }
  });
});
