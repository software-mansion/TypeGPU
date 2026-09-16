import type { ClassDeclaration, ClassProperty, Expression, Node } from '@babel/types';
import * as acorn from 'acorn';
import { describe, expect, it } from 'vitest';
import { dualTest, parseBabel } from './helpers.ts';

describe('source map', () => {
  it(
    'leaves source map empty when not provided',
    dualTest((p, transpileFn) => {
      const { params, externalNames, body, sourceMap } = transpileFn(
        p(`() => {
          const x = 2 + 2 * 2;
        }`),
      );

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"x",[1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
      expect(sourceMap).toMatchInlineSnapshot(`Map {}`);
    }),
  );

  it(
    'assigns proper sourcemap',
    dualTest((p, transpileFn) => {
      const typeToNum = {
        BlockStatement: 10,
        VariableDeclaration: 11,
        Identifier: 12,
        BinaryExpression: 13,
        NumericLiteral: 14,
        Literal: 14,
      };

      let index = 0;
      const { params, externalNames, body, sourceMap } = transpileFn(
        p(`() => {
          const x = 2 + 2 * 2;
        }`),
        { sourceMap: (node) => [++index, typeToNum[node.type as keyof typeof typeToNum]] },
      );

      expect(params).toStrictEqual([]);
      expect(JSON.stringify(body)).toMatchInlineSnapshot(
        `"[0,[[13,"x",[1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]]]]]"`,
      );
      expect(externalNames).toMatchInlineSnapshot(`Map {}`);
      expect(sourceMap).toMatchInlineSnapshot(`Map {}`);
    }),
  );
});
