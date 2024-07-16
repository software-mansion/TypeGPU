import { describe, expect, it } from 'vitest';
import type { FloatLiteral } from './grammar';
import { parse } from './index';

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
    for (const example_float of EXAMPLE_FLOAT_LITERALS) {
      expect(parse(example_float)).toEqual({
        type: 'float_literal',
        value: example_float,
      } satisfies FloatLiteral);
    }
  });
});
