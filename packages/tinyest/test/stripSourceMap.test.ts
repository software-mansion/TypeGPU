import { describe, expect, it } from 'vitest';
import type {
  BinaryExpression,
  Literal,
  ObjectExpression,
  SourceMappedNode,
} from '../src/index.ts';
import { NodeTypeCatalog as N } from '../src/index.ts';
import { stripSourceMap } from '../src/stripSourceMap.ts';

describe('stripSourceMap', () => {
  it('works for top level map', () => {
    const variable = [N.identifier, 'variable'] as const;
    const node = [-1, 10, 1, variable] as unknown as SourceMappedNode;

    const [strippedNode, sourceMap] = stripSourceMap(node);

    expect(strippedNode).toStrictEqual([9, 'variable']);
    expect(sourceMap.get(variable)).toStrictEqual([10, 1]);
  });

  it('works for nested map', () => {
    const left = [N.identifier, 'a'] as const;
    const right = [N.identifier, 'b'] as const;
    const add = [
      N.binaryExpr,
      [-1, 1, 2, left],
      '+',
      [-1, 3, 4, right],
    ] as unknown as BinaryExpression;
    const node = [-1, 5, 6, add];

    const [strippedNode, sourceMap] = stripSourceMap(node);

    expect(strippedNode).toStrictEqual([1, [9, 'a'], '+', [9, 'b']]);
    expect(sourceMap.get(left)).toStrictEqual([1, 2]);
    expect(sourceMap.get(right)).toStrictEqual([3, 4]);
    expect(sourceMap.get(add)).toMatchInlineSnapshot([5, 6]);
  });

  it('works for objects', () => {
    const value1: Literal = [N.numericLiteral, '1.1'];
    const value2: Literal = [N.numericLiteral, '1.2'];
    const obj: ObjectExpression = [
      N.objectExpr,
      { p: value1, q: [-1, 1, 2, value2] as unknown as Literal },
    ];

    const [strippedNode, sourceMap] = stripSourceMap(obj);

    expect(strippedNode).toStrictEqual([N.objectExpr, { p: value1, q: value2 }]);
    expect(sourceMap.get(value1)).toStrictEqual(undefined);
    expect(sourceMap.get(value2)).toStrictEqual([1, 2]);
    expect(sourceMap.get(obj)).toStrictEqual(undefined);
  });
});
