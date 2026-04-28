import { describe, expect, it } from 'vitest';
import * as tinyest from 'tinyest';
import { getMetaData } from '../../src/shared/meta.ts';
import { stringifyNode } from '../../src/shared/tseynit.ts';
import tgpu, { d } from 'typegpu';

function getBodyAst(fn: () => void) {
  const ast = getMetaData(fn)?.ast?.body;
  if (!ast) {
    throw new Error('Expected ast to be defined');
  }
  return ast;
}

describe('ast to JS transformation', () => {
  const N = tinyest.NodeTypeCatalog;

  describe('stringify expression', () => {
    it('handles identifiers', () => {
      expect(stringifyNode('myVar')).toBe('myVar');
    });

    it('handles boolean literals', () => {
      expect(stringifyNode(true)).toBe('true');
      expect(stringifyNode(false)).toBe('false');
    });

    it('handles numeric literals', () => {
      expect(stringifyNode([N.numericLiteral, '42'] satisfies tinyest.Num)).toBe('42');
      expect(stringifyNode([N.numericLiteral, '6.7'] satisfies tinyest.Num)).toBe('6.7');
      expect(stringifyNode([N.numericLiteral, '-0.0'] satisfies tinyest.Num)).toBe('-0.0');
    });

    it('handles string literals', () => {
      expect(stringifyNode([N.stringLiteral, 'hello'] satisfies tinyest.Str)).toMatchInlineSnapshot(
        `""hello""`,
      );
      expect(
        stringifyNode([N.stringLiteral, "'hello'"] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""'hello'""`);
      expect(
        stringifyNode([N.stringLiteral, '"hello"'] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""\\"hello\\"""`);
      expect(
        stringifyNode([N.stringLiteral, '`hello`'] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""\`hello\`""`);
      expect(
        stringifyNode([N.stringLiteral, `hello\``] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""hello\`""`);
    });

    it('handles array expressions', () => {
      const node: tinyest.ArrayExpression = [
        N.arrayExpr,
        [
          [N.numericLiteral, '1'],
          [N.numericLiteral, '2'],
          [N.stringLiteral, 'three'],
        ],
      ];
      expect(stringifyNode(node)).toBe(`[1, 2, "three"]`);
    });

    it('handles binary expressions', () => {
      const node: tinyest.BinaryExpression = [
        N.binaryExpr,
        [N.numericLiteral, '1'],
        '+',
        [N.numericLiteral, '2'],
      ];
      expect(stringifyNode(node)).toBe('1 + 2');
    });

    it('wraps nested binary sub-expression in parens', () => {
      const node: tinyest.BinaryExpression = [
        N.binaryExpr,
        [N.binaryExpr, [N.numericLiteral, '1'], '+', [N.numericLiteral, '2']],
        '*',
        [N.numericLiteral, '3'],
      ];
      expect(stringifyNode(node)).toBe('(1 + 2) * 3');
    });

    it('handles unary symbol operators', () => {
      const nodeA: tinyest.UnaryExpression = [N.unaryExpr, '-', 'x'];
      expect(stringifyNode(nodeA)).toBe('-x');
      const nodeB: tinyest.UnaryExpression = [N.unaryExpr, '-', [N.binaryExpr, 'x', '+', 'y']];
      expect(stringifyNode(nodeB)).toBe('-(x + y)');
    });

    it('handles unary word operators', () => {
      const node: tinyest.UnaryExpression = [N.unaryExpr, 'typeof', 'x'];
      expect(stringifyNode(node)).toBe('typeof x');
    });

    it('handles logical expressions', () => {
      const node: tinyest.LogicalExpression = [N.logicalExpr, 'a', '&&', 'b'];
      expect(stringifyNode(node)).toBe('a && b');
    });

    it('handles assignment expressions', () => {
      const node: tinyest.AssignmentExpression = [
        N.assignmentExpr,
        'x',
        '=',
        [N.numericLiteral, '1'],
      ];
      expect(stringifyNode(node)).toBe('x = 1');
    });

    it('handles function calls', () => {
      const node: tinyest.Call = [
        N.call,
        'foo',
        [
          [N.numericLiteral, '1'],
          [N.numericLiteral, '2'],
        ],
      ];
      expect(stringifyNode(node)).toBe('foo(1, 2)');
    });

    it('handles member access', () => {
      const nodeA: tinyest.MemberAccess = [N.memberAccess, [N.memberAccess, 'a', 'b'], 'c'];
      expect(stringifyNode(nodeA)).toBe('a.b.c');
      const nodeB: tinyest.MemberAccess = [N.memberAccess, [N.numericLiteral, '1'], 'toString'];
      expect(stringifyNode(nodeB)).toBe('(1).toString');
    });

    it('handles index access', () => {
      const nodeA: tinyest.IndexAccess = [N.indexAccess, 'arr', [N.numericLiteral, '0']];
      expect(stringifyNode(nodeA)).toBe('arr[0]');
      const nodeB: tinyest.IndexAccess = [
        N.indexAccess,
        [N.arrayExpr, ['a', 'b', 'c']],
        [N.numericLiteral, '0'],
      ];
      expect(stringifyNode(nodeB)).toBe('[a, b, c][0]');
    });

    it('handles post-update', () => {
      const node: tinyest.PostUpdate = [N.postUpdate, '++', 'i'];
      expect(stringifyNode(node)).toBe('i++');
    });

    it('handles pre-update', () => {
      const node: tinyest.PreUpdate = [N.preUpdate, '--', 'i'];
      expect(stringifyNode(node)).toBe('--i');
    });

    it('handles object expressions', () => {
      const node: tinyest.ObjectExpression = [N.objectExpr, { a: [N.numericLiteral, '1'], b: 'x' }];
      expect(stringifyNode(node)).toBe('{ a: 1, b: x }');
    });

    it('handles conditional expressions', () => {
      const node: tinyest.ConditionalExpression = [
        N.conditionalExpr,
        'x',
        [N.numericLiteral, '1'],
        [N.numericLiteral, '2'],
      ];
      expect(stringifyNode(node)).toBe('x ? 1 : 2');
    });
  });

  // 'use gpu' is used here so that we don't have to write the AST manually
  describe('stringify statement', () => {
    it('handles blocks', () => {
      const fn = () => {
        'use gpu';
        [1, 2, 'three'];
        [4, 5];
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          [1, 2, "three"];
          [4, 5];
        }"
      `);
    });

    it('handles declarations', () => {
      const fn = () => {
        'use gpu';
        const val = 42;
        let i = 0;
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          const val = 42;
          let i = 0;
        }"
      `);
    });

    it('handles return statement', () => {
      const fnA = () => {
        'use gpu';
        return 0;
      };
      const fnB = () => {
        'use gpu';
        return;
      };
      expect(stringifyNode(getBodyAst(fnA))).toMatchInlineSnapshot(`
        "{
          return 0;
        }"
      `);
      expect(stringifyNode(getBodyAst(fnB))).toMatchInlineSnapshot(`
        "{
          return;
        }"
      `);
    });

    it('handles if/else statement', () => {
      const fn = () => {
        'use gpu';
        let x = 0;
        const cond = false;
        if (cond) {
          x = 1;
        } else {
          x = 2;
        }
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          let x = 0;
          const cond = false;
          if (cond) {
            x = 1;
          } else {
            x = 2;
          }
        }"
      `);
    });

    it('handles for loop', () => {
      const fn = () => {
        'use gpu';
        for (let i = 0; i < 10; i++) {
          const j = i;
        }
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          for (let i = 0; i < 10; i++) {
            const j = i;
          }
        }"
      `);
    });

    it('handles while loop', () => {
      const fn = () => {
        'use gpu';
        let x = 10;
        while (x) {
          x /= 2;
        }
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          let x = 10;
          while (x) {
            x /= 2;
          }
        }"
      `);
    });

    it('handles continue and break', () => {
      const fn = () => {
        'use gpu';
        while (true) {
          if (true) {
            continue;
          }
          break;
        }
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          while (true) {
            if (true) {
              continue;
            }
            break;
          }
        }"
      `);
    });

    it('handles for-of loop', () => {
      const fn = () => {
        'use gpu';
        for (const item of [1, 2, 3]) {
        }
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          for (const item of [1, 2, 3]) {

          }
        }"
      `);
    });

    it('does not retain TS types', () => {
      const fn = () => {
        'use gpu';
        let a: number = 0;
        const b = 1 satisfies unknown;
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          let a = 0;
          const b = 1;
        }"
      `);
    });

    it('handles undefined', () => {
      const slot = tgpu.slot(d.u32);
      const fn = () => {
        'use gpu';
        if (slot.$ !== undefined) {
        }
      };
      expect(stringifyNode(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          if (slot.$ !== undefined) {

          }
        }"
      `);
    });
  });
});
