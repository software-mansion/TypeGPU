import { describe, expect, it } from 'vitest';
import type { BoolLiteral } from './grammar';
import { parse } from './index';

describe('bool_literal', () => {
  it('parses "true"', () => {
    expect(parse('true')).toEqual({
      type: 'bool_literal',
      value: 'true',
    } satisfies BoolLiteral);
  });

  it('parses "false"', () => {
    expect(parse('false')).toEqual({
      type: 'bool_literal',
      value: 'false',
    } satisfies BoolLiteral);
  });
});
