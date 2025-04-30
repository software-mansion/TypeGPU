import { describe, expect, it } from 'vitest';
import type { BoolLiteral } from '../src/grammar.ts';
import { parse } from '../src/index.ts';

describe('bool_literal', () => {
  it('parses "true"', () => {
    expect(parse('true')).toStrictEqual({
      type: 'bool_literal',
      value: 'true',
    } satisfies BoolLiteral);
  });

  it('parses "false"', () => {
    expect(parse('false')).toStrictEqual({
      type: 'bool_literal',
      value: 'false',
    } satisfies BoolLiteral);
  });
});
