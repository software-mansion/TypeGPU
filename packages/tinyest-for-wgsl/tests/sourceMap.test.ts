import { describe, expect, it } from 'vitest';
import { dualTest } from './helpers.ts';
import type { SourceMap } from 'tinyest';

function stringifyMap(map: SourceMap) {
  return [...map.entries()].map(([key, value]) => `${JSON.stringify(key)} => ${value} `).join('\n');
}

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
      expect(sourceMap.size).toBe(0);
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
      expect(stringifyMap(sourceMap)).toMatchInlineSnapshot(`
        "[5,"2"] => 1,14 
        [5,"2"] => 2,14 
        [5,"2"] => 3,14 
        [1,[5,"2"],"*",[5,"2"]] => 4,13 
        [1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]] => 5,13 
        [13,"x",[1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]]] => 6,11 
        [0,[[13,"x",[1,[5,"2"],"+",[1,[5,"2"],"*",[5,"2"]]]]]] => 7,10 "
      `);
    }),
  );
});
