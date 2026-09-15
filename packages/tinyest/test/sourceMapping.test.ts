import { describe, expect, it } from 'vitest';
import type {
  AnyNode,
  BinaryExpression,
  Block,
  Bool,
  Call,
  Const,
  For,
  Identifier,
  Null,
  Num,
  ObjectExpression,
  ObjectProperty,
  SourceMap,
  Statement,
} from '../src/index.ts';
import { NodeTypeCatalog as N } from '../src/index.ts';
import { embedSourceMap, SourceMapNodeType, stripSourceMap } from '../src/sourceMapping.ts';

function mapped<T>(node: T, line: number, column: number): T {
  return [SourceMapNodeType, line, column, node] as unknown as T;
}

describe('source maps', () => {
  describe('embedSourceMap', () => {
    it('embeds source map', () => {
      const node: Identifier = [N.identifier, 'ident'];
      const sourceMap: SourceMap = new Map([[node, [1, 2]]]);

      const mapped = embedSourceMap(node, sourceMap);

      expect(JSON.stringify(mapped)).toMatchInlineSnapshot(`"[-1,1,2,[9,"ident"]]"`);
    });

    it('embeds nested source map', () => {
      const ident: Identifier = [N.identifier, 'ident'];
      const constDecl: Const = [N.const, ident, 'other'];
      const sourceMap: SourceMap = new Map<AnyNode, [number, number]>([
        [ident, [1, 2]],
        [constDecl, [3, 4]],
      ]);

      const mapped = embedSourceMap(constDecl, sourceMap);

      expect(JSON.stringify(mapped)).toMatchInlineSnapshot(
        `"[-1,3,4,[13,[-1,1,2,[9,"ident"]],"other"]]"`,
      );
    });

    it('does not embed for primitives', () => {
      const ident: Identifier = 'ident';
      const value: Bool = true;
      const constDecl: Const = [N.const, ident, value];
      const sourceMap: SourceMap = new Map<AnyNode, [number, number]>([
        [ident, [1, 2]],
        [value, [3, 4]],
      ]);

      const mapped = embedSourceMap(constDecl, sourceMap);

      expect(JSON.stringify(mapped)).toMatchInlineSnapshot(`"[13,"ident",true]"`);
    });

    it('embeds for objectExpr with a property record', () => {
      const p: Num = [N.numericLiteral, '1.1'];
      const q: Num = [N.numericLiteral, '1.2'];
      const obj: ObjectExpression = [N.objectExpr, { p, q }];
      const sourceMap: SourceMap = new Map<AnyNode, [number, number]>([
        [q, [1, 2]],
        [obj, [3, 4]],
      ]);

      const embedded = embedSourceMap(obj, sourceMap);

      expect(JSON.stringify(embedded)).toMatchInlineSnapshot(
        `"[-1,3,4,[104,{"p":[5,"1.1"],"q":[-1,1,2,[5,"1.2"]]}]]"`,
      );
    });

    it('embeds for objectExpr with a property list', () => {
      const key: Identifier = [N.identifier, 'str'];
      const value: Num = [N.numericLiteral, '1.1'];
      const prop: ObjectProperty = [key, value, true];
      const obj: ObjectExpression = [N.objectExpr, [prop]];
      const sourceMap: SourceMap = new Map<AnyNode, [number, number]>([
        [key, [1, 2]],
        [value, [3, 4]],
      ]);

      const embedded = embedSourceMap(obj, sourceMap);

      expect(JSON.stringify(embedded)).toMatchInlineSnapshot(
        `"[104,[[[-1,1,2,[9,"str"]],[-1,3,4,[5,"1.1"]],true]]]"`,
      );
    });

    it('does not modify the original node', () => {
      const ident: Identifier = [N.identifier, 'ident'];
      const constDecl: Const = [N.const, ident, [N.numericLiteral, '1.1']];
      const sourceMap: SourceMap = new Map<AnyNode, [number, number]>([[ident, [1, 2]]]);

      embedSourceMap(constDecl, sourceMap);

      expect(constDecl).toStrictEqual([
        N.const,
        [N.identifier, 'ident'],
        [N.numericLiteral, '1.1'],
      ]);
    });
  });

  describe('stripSourceMap', () => {
    it('works for non-mapped AST', () => {
      const node: Const = [N.const, [N.identifier, 'n'], [N.numericLiteral, '6.7']];

      const [strippedNode, sourceMap] = stripSourceMap(node) as [Const, SourceMap];

      expect(strippedNode).toStrictEqual(node);
      expect(strippedNode).not.toBe(node);
      expect(strippedNode[1]).not.toBe(node[1]);
      expect(strippedNode[2]).not.toBe(node[2]);
      expect(sourceMap.size).toBe(0);
    });

    it('works for top level map', () => {
      const node: Identifier = mapped([N.identifier, 'variable'], 1, 2);

      const [strippedNode, sourceMap] = stripSourceMap(node) as [Identifier, SourceMap];

      expect(strippedNode).toStrictEqual([9, 'variable']);
      expect(sourceMap.get(strippedNode)).toStrictEqual([1, 2]);
      expect(sourceMap.size).toBe(1);
    });

    it('strips double map', () => {
      const node: Identifier = mapped(mapped([N.identifier, 'variable'], 1, 2), 3, 4);

      const [strippedNode] = stripSourceMap(node) as [Identifier, SourceMap];

      expect(strippedNode).toStrictEqual([9, 'variable']);
      // Resulting source map's behavior is not defined.
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
      expect(sourceMap.size).toBe(3);
    });

    it('does not map primitives', () => {
      const node: Const = [N.const, mapped('variable', 1, 2), mapped(true, 3, 4)];

      const [strippedNode, sourceMap] = stripSourceMap(node) as [Identifier, SourceMap];

      expect(strippedNode).toStrictEqual([N.const, 'variable', true]);
      expect(sourceMap.size).toBe(0);
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
      expect(sourceMap.get((strippedNode[1] as { q: AnyNode }).q)).toStrictEqual([1, 2]);
      expect(sourceMap.size).toBe(1);
    });

    it('works for with property list', () => {
      const obj: ObjectExpression = [
        N.objectExpr,
        [
          mapped(['key', mapped('value', 1, 2), false], 7, 8),
          mapped([mapped([N.identifier, 'str'], 3, 4), mapped('value', 5, 6), true], 9, 10),
        ],
      ];

      const [strippedNode, sourceMap] = stripSourceMap(obj) as [ObjectExpression, SourceMap];

      expect(strippedNode).toStrictEqual([
        N.objectExpr,
        [
          ['key', 'value', false],
          [[N.identifier, 'str'], 'value', true],
        ],
      ]);
      expect(sourceMap.size).toBe(3);
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
      expect(sourceMap.size).toBe(3);
    });

    it('works for nulls', () => {
      const node: For = [N.for, null, null, null, [N.block, []]];

      const [strippedNode, sourceMap] = stripSourceMap(node);

      expect(strippedNode).toStrictEqual(node);
      expect(sourceMap.size).toBe(0);
    });

    it('works for null literal', () => {
      const node: Null = mapped([N.nullLiteral], 1, 2);

      const [strippedNode, sourceMap] = stripSourceMap(node);

      expect(strippedNode).toStrictEqual([N.nullLiteral]);
      expect(sourceMap.get(strippedNode)).toStrictEqual([1, 2]);
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

  describe('e2e inverse property', () => {
    it('embed -> strip', () => {
      const node: Identifier = [N.identifier, 'ident'];
      const sourceMap: SourceMap = new Map([[node, [1, 2]]]);

      const sourceMappedNode = embedSourceMap(node, sourceMap);
      const [restoredNode, restoredSourceMap] = stripSourceMap(sourceMappedNode);

      expect(restoredSourceMap).toMatchInlineSnapshot(`
        Map {
          [
            9,
            "ident",
          ] => [
            1,
            2,
          ],
        }
      `);
      expect(restoredNode).toStrictEqual(node);
    });

    it('strip -> embed', () => {
      const node: Identifier = mapped([N.identifier, 'ident'], 1, 2);

      const [strippedNode, strippedSourceMap] = stripSourceMap(node);
      const restoredNode = embedSourceMap(strippedNode, strippedSourceMap);

      expect(JSON.stringify(restoredNode)).toMatchInlineSnapshot(`"[-1,1,2,[9,"ident"]]"`);
      expect(restoredNode).toStrictEqual(node);
    });
  });
});
