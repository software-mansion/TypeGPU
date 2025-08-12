import { describe, expect, it } from 'vitest';
import { createDualImpl } from '../../src/core/function/dualImpl.ts';
import { getName } from '../../src/shared/meta.ts';

describe('createDualImpl', () => {
  it('names functions created by createDualImpl', () => {
    const dual = createDualImpl({
      name: 'myDualImpl',
      normalImpl: (a) => a,
      codegenImpl: (snippet) => snippet,
    });
    expect(getName(dual)).toBe('myDualImpl');
  });
});
