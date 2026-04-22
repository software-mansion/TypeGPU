import { describe } from 'node:test';
import { expect, it } from 'vitest';
import { getMetaData } from '../../src/shared/meta.ts';
import { stringifyExpression, stringifyStatement } from '../../src/shared/tseynit/stringify.ts';

describe('it parses AST back to JS', () => {
  it('handles array expressions', () => {
    const fn = () => {
      'use gpu';
      [1, 2, 'three'];
    };
    const ast = getMetaData(fn)?.ast?.body;
    expect(ast).toBeDefined();

    const result = stringifyStatement(ast!);

    expect(result).toMatchInlineSnapshot(`
      "{
        [1, 2, 'three'];
      }"
    `);
  });
});
