import { describe, expect, it } from 'vitest';
import type {
  AnyNode,
  BinaryExpression,
  Block,
  Bool,
  Call,
  Expression,
  For,
  Identifier,
  ObjectExpression,
  ObjectProperty,
  SourceMap,
} from '../src/index.ts';
import { NodeTypeCatalog as N } from '../src/index.ts';
import { stripSourceMap } from '../src/stripSourceMap.ts';

function mapped<T>(node: T, line: number, column: number): T {
  return [-1, line, column, node] as unknown as T;
}

describe('stripSourceMap', () => {
  it('works for top level map', () => {
    const node: Identifier = mapped([N.identifier, 'variable'], 1, 2);

    const [strippedNode, sourceMap] = stripSourceMap(node) as [Identifier, SourceMap];

    expect(strippedNode).toStrictEqual([9, 'variable']);
    expect(sourceMap.get(strippedNode)).toStrictEqual([1, 2]);
  });

  it('works for nested map', () => {
    const node: BinaryExpression = mapped(
      [N.binaryExpr, mapped([N.identifier, 'a'], 1, 2), '+', mapped([N.identifier, 'b'], 3, 4)],
      5,
      6,
    );

    const [strippedNode, sourceMap] = stripSourceMap(node) as [BinaryExpression, SourceMap];

    expect(strippedNode).toStrictEqual([
      N.binaryExpr,
      [N.identifier, 'a'],
      '+',
      [N.identifier, 'b'],
    ]);
    expect(sourceMap.get(strippedNode[1])).toStrictEqual([1, 2]);
    expect(sourceMap.get(strippedNode[3])).toStrictEqual([3, 4]);
    expect(sourceMap.get(strippedNode)).toStrictEqual([5, 6]);
  });

  it('works for objects', () => {
    const obj: ObjectExpression = [
      N.objectExpr,
      {
        p: [N.numericLiteral, '1.1'],
        q: mapped([N.numericLiteral, '1.2'], 1, 2),
      },
    ];

    const [strippedNode, sourceMap] = stripSourceMap(obj) as [ObjectExpression, SourceMap];

    expect(strippedNode).toStrictEqual([
      N.objectExpr,
      { p: [N.numericLiteral, '1.1'], q: [N.numericLiteral, '1.2'] },
    ]);
    const { p, q } = strippedNode[1] as Record<'p' | 'q', Expression>;
    expect(sourceMap.get(p)).toStrictEqual(undefined);
    expect(sourceMap.get(q)).toStrictEqual([1, 2]);
    expect(sourceMap.get(strippedNode)).toStrictEqual(undefined);
  });

  it('works for with property list', () => {
    const obj: ObjectExpression = [
      N.objectExpr,
      [
        mapped(['key', mapped('value', 1, 2), false], 7, 8),
        mapped([mapped('str', 3, 4), mapped('value', 5, 6), true], 9, 10),
      ],
    ];

    const [strippedNode] = stripSourceMap(obj) as [ObjectExpression, SourceMap];

    expect(strippedNode).toStrictEqual([
      N.objectExpr,
      [
        ['key', 'value', false],
        ['str', 'value', true],
      ],
    ]);
  });

  it('works for blocks', () => {
    const block: Block = [
      N.block,
      [
        mapped([N.call, 'f', []], 1, 2),
        mapped([N.call, 'g', []], 3, 4),
        mapped([N.call, 'h', []], 5, 6),
      ],
    ];

    const [strippedNode, sourceMap] = stripSourceMap(block) as [Block, SourceMap];

    expect(strippedNode).toStrictEqual([
      N.block,
      [
        [N.call, 'f', []],
        [N.call, 'g', []],
        [N.call, 'h', []],
      ],
    ]);
    const [call1, call2, call3] = strippedNode[1] as [Call, Call, Call];
    expect(sourceMap.get(strippedNode)).toStrictEqual(undefined);
    expect(sourceMap.get(call1)).toStrictEqual([1, 2]);
    expect(sourceMap.get(call2)).toStrictEqual([3, 4]);
    expect(sourceMap.get(call3)).toStrictEqual([5, 6]);
  });

  it('works for nulls', () => {
    const node: For = [N.for, null, null, null, [N.block, []]];

    const [strippedNode] = stripSourceMap(node);

    expect(strippedNode).toStrictEqual(node);
  });

  it('works for bools', () => {
    const node: Bool = true;

    const [strippedNode] = stripSourceMap(node);

    expect(strippedNode).toStrictEqual(node);
  });

  it('works for string idents', () => {
    const node: Identifier = 'ident';

    const [strippedNode] = stripSourceMap(node);

    expect(strippedNode).toStrictEqual(node);
  });
});
