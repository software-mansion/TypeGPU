import { describe, expect, it } from 'vitest';
import * as tinyest from 'tinyest';
import { getMetaData } from '../../src/shared/meta.ts';
import { stringifyExpression, stringifyStatement } from '../../src/shared/tseynit/stringify.ts';

function getBodyAst(fn: () => void) {
  const ast = getMetaData(fn)?.ast?.body;
  if (!ast) {
    throw new Error('Expected ast to be defined');
  }
  return ast;
}

describe('ast to JS transformation', () => {
  const N = tinyest.NodeTypeCatalog;

  describe('stringifyExpression', () => {
    it('handles identifiers', () => {
      expect(stringifyExpression('myVar')).toBe('myVar');
    });

    it('handles boolean literals', () => {
      expect(stringifyExpression(true)).toBe('true');
      expect(stringifyExpression(false)).toBe('false');
    });

    it('handles numeric literals', () => {
      expect(stringifyExpression([N.numericLiteral, '42'] satisfies tinyest.Num)).toBe('42');
      expect(stringifyExpression([N.numericLiteral, '6.7'] satisfies tinyest.Num)).toBe('6.7');
      expect(stringifyExpression([N.numericLiteral, '-0.0'] satisfies tinyest.Num)).toBe('-0.0');
    });

    it('handles string literals', () => {
      expect(
        stringifyExpression([N.stringLiteral, 'hello'] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""hello""`);
      expect(
        stringifyExpression([N.stringLiteral, "'hello'"] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""'hello'""`);
      expect(
        stringifyExpression([N.stringLiteral, '"hello"'] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""\\"hello\\"""`);
      expect(
        stringifyExpression([N.stringLiteral, '`hello`'] satisfies tinyest.Str),
      ).toMatchInlineSnapshot(`""\`hello\`""`);
      expect(
        stringifyExpression([N.stringLiteral, `hello\``] satisfies tinyest.Str),
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
      expect(stringifyExpression(node)).toBe(`[1, 2, "three"]`);
    });

    it('handles binary expressions', () => {
      const node: tinyest.BinaryExpression = [
        N.binaryExpr,
        [N.numericLiteral, '1'],
        '+',
        [N.numericLiteral, '2'],
      ];
      expect(stringifyExpression(node)).toBe('1 + 2');
    });

    it('wraps nested binary sub-expression in parens', () => {
      const node: tinyest.BinaryExpression = [
        N.binaryExpr,
        [N.binaryExpr, [N.numericLiteral, '1'], '+', [N.numericLiteral, '2']],
        '*',
        [N.numericLiteral, '3'],
      ];
      expect(stringifyExpression(node)).toBe('(1 + 2) * 3');
    });

    it('handles unary symbol operators', () => {
      const nodeA: tinyest.UnaryExpression = [N.unaryExpr, '-', 'x'];
      expect(stringifyExpression(nodeA)).toBe('-x');
      const nodeB: tinyest.UnaryExpression = [N.unaryExpr, '-', [N.binaryExpr, 'x', '+', 'y']];
      expect(stringifyExpression(nodeB)).toBe('-(x + y)');
    });

    it('handles unary word operators', () => {
      const node: tinyest.UnaryExpression = [N.unaryExpr, 'typeof', 'x'];
      expect(stringifyExpression(node)).toBe('typeof x');
    });

    it('handles logical expressions', () => {
      const node: tinyest.LogicalExpression = [N.logicalExpr, 'a', '&&', 'b'];
      expect(stringifyExpression(node)).toBe('a && b');
    });

    it('handles assignment expressions', () => {
      const node: tinyest.AssignmentExpression = [
        N.assignmentExpr,
        'x',
        '=',
        [N.numericLiteral, '1'],
      ];
      expect(stringifyExpression(node)).toBe('x = 1');
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
      expect(stringifyExpression(node)).toBe('foo(1, 2)');
    });

    it('handles member access', () => {
      const nodeA: tinyest.MemberAccess = [N.memberAccess, [N.memberAccess, 'a', 'b'], 'c'];
      expect(stringifyExpression(nodeA)).toBe('a.b.c');
      const nodeB: tinyest.MemberAccess = [N.memberAccess, [N.numericLiteral, '1'], 'toString'];
      expect(stringifyExpression(nodeB)).toBe('(1).toString');
    });

    it('handles index access', () => {
      const nodeA: tinyest.IndexAccess = [N.indexAccess, 'arr', [N.numericLiteral, '0']];
      expect(stringifyExpression(nodeA)).toBe('arr[0]');
      const nodeB: tinyest.IndexAccess = [
        N.indexAccess,
        [N.arrayExpr, ['a', 'b', 'c']],
        [N.numericLiteral, '0'],
      ];
      expect(stringifyExpression(nodeB)).toBe('[a, b, c][0]');
    });

    it('handles post-update', () => {
      const node: tinyest.PostUpdate = [N.postUpdate, '++', 'i'];
      expect(stringifyExpression(node)).toBe('i++');
    });

    it('handles pre-update', () => {
      const node: tinyest.PreUpdate = [N.preUpdate, '--', 'i'];
      expect(stringifyExpression(node)).toBe('--i');
    });

    it('handles object expressions', () => {
      const node: tinyest.ObjectExpression = [N.objectExpr, { a: [N.numericLiteral, '1'], b: 'x' }];
      expect(stringifyExpression(node)).toBe('{ a: 1, b: x }');
    });

    it('handles conditional expressions', () => {
      const node: tinyest.ConditionalExpression = [
        N.conditionalExpr,
        'x',
        [N.numericLiteral, '1'],
        [N.numericLiteral, '2'],
      ];
      expect(stringifyExpression(node)).toBe('x ? 1 : 2');
    });
  });

  // 'use gpu' is used here so that we don't have to write the AST manually
  describe('stringifyStatement', () => {
    it('handles blocks', () => {
      const fn = () => {
        'use gpu';
        [1, 2, 'three'];
        [4, 5];
      };
      expect(stringifyStatement(getBodyAst(fn))).toMatchInlineSnapshot(`
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
      expect(stringifyStatement(getBodyAst(fn))).toMatchInlineSnapshot(`
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
      expect(stringifyStatement(getBodyAst(fnA))).toMatchInlineSnapshot(`
        "{
          return 0;
        }"
      `);
      expect(stringifyStatement(getBodyAst(fnB))).toMatchInlineSnapshot(`
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
      expect(stringifyStatement(getBodyAst(fn))).toMatchInlineSnapshot(`
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
      expect(stringifyStatement(getBodyAst(fn))).toMatchInlineSnapshot(`
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
      expect(stringifyStatement(getBodyAst(fn))).toMatchInlineSnapshot(`
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
      expect(stringifyStatement(getBodyAst(fn))).toMatchInlineSnapshot(`
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
      expect(stringifyStatement(getBodyAst(fn))).toMatchInlineSnapshot(`
        "{
          for (const item of [1, 2, 3]) {

          }
        }"
      `);
    });
  });
});
