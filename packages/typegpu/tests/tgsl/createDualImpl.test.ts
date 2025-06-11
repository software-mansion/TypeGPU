import { describe, expect, it } from 'vitest';
import { createDualImpl } from '../../src/shared/generators.ts';
import { getName } from '../../src/shared/meta.ts';

describe('wgslGenerator', () => {
  it('names functions created by createDualImpl', () => {
    const dual = createDualImpl(
      (a) => a,
      (snippet) => snippet,
      'myDualImpl',
    );
    expect(getName(dual)).toBe('myDualImpl');
  });
});
