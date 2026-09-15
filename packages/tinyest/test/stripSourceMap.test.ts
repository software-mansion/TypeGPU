import { describe, expect, it } from 'vitest';
import type {
  BinaryExpression,
  Block,
  Bool,
  Call,
  Expression,
  For,
  Identifier,
  Literal,
  ObjectExpression,
  ObjectProperty,
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
    expect(sourceMap.get(add)).toStrictEqual([5, 6]);
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

  it('works for with property list', () => {
    const entry1: ObjectProperty = ['key', [-1, 1, 2, 'value'] as unknown as Expression, false];
    const entry2: ObjectProperty = [
      [-1, 3, 4, 'str'] as unknown as Expression,
      [-1, 5, 6, 'value'] as unknown as Expression,
      true,
    ];
    const obj: ObjectExpression = [
      N.objectExpr,
      [
        [-1, 7, 8, entry1] as unknown as ObjectProperty,
        [-1, 9, 10, entry2] as unknown as ObjectProperty,
      ],
    ];

    const [strippedNode, sourceMap] = stripSourceMap(obj);

    expect(strippedNode).toStrictEqual([
      N.objectExpr,
      [
        ['key', 'value', false],
        ['str', 'value', true],
      ],
    ]);
  });

  it('works for blocks', () => {
    const call1: Call = [N.call, 'f', []];
    const call2: Call = [N.call, 'g', []];
    const call3: Call = [N.call, 'h', []];
    const block: Block = [
      N.block,
      [
        [-1, 1, 2, call1] as unknown as Call,
        [-1, 3, 4, call2] as unknown as Call,
        [-1, 5, 6, call3] as unknown as Call,
      ],
    ];

    const [strippedNode, sourceMap] = stripSourceMap(block);

    expect(strippedNode).toStrictEqual([N.block, [call1, call2, call3]]);
    expect(sourceMap.get(block)).toStrictEqual(undefined);
    expect(sourceMap.get(call1)).toStrictEqual([1, 2]);
    expect(sourceMap.get(call2)).toStrictEqual([3, 4]);
    expect(sourceMap.get(call3)).toStrictEqual([5, 6]);
  });

  it('works for nulls', () => {
    const node: For = [N.for, null, null, null, [N.block, []]];

    const [strippedNode] = stripSourceMap(node);

    expect(strippedNode).toBe(node);
  });

  it('works for bools', () => {
    const node: Bool = true;

    const [strippedNode] = stripSourceMap(node);

    expect(strippedNode).toBe(node);
  });

  it('works for string idents', () => {
    const node: Identifier = 'ident';

    const [strippedNode] = stripSourceMap(node);

    expect(strippedNode).toBe(node);
  });
});
