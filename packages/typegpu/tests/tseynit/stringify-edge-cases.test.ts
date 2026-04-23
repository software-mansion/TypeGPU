// These tests won't be in the final PR, they are here only as a sanity check.

import { describe, expect, it } from 'vitest';
import * as tinyest from 'tinyest';
import { stringifyExpression, stringifyStatement } from '../../src/shared/tseynit/stringify.ts';

const N = tinyest.NodeTypeCatalog;

describe('stringify edge cases', () => {
  describe('stringifyExpression', () => {
    describe('empty containers', () => {
      it('handles empty array', () => {
        const node: tinyest.ArrayExpression = [N.arrayExpr, []];
        expect(stringifyExpression(node)).toBe('[]');
      });

      it('handles empty object', () => {
        const node: tinyest.ObjectExpression = [N.objectExpr, {}];
        expect(stringifyExpression(node)).toBe('{  }');
      });

      it('handles call with no arguments', () => {
        const node: tinyest.Call = [N.call, 'foo', []];
        expect(stringifyExpression(node)).toBe('foo()');
      });
    });

    describe('unary operators', () => {
      it('handles ! (logical NOT)', () => {
        expect(stringifyExpression([N.unaryExpr, '!', 'x'] satisfies tinyest.UnaryExpression)).toBe(
          '!x',
        );
      });

      it('handles ~ (bitwise NOT)', () => {
        expect(stringifyExpression([N.unaryExpr, '~', 'x'] satisfies tinyest.UnaryExpression)).toBe(
          '~x',
        );
      });

      it('handles + (unary plus)', () => {
        expect(stringifyExpression([N.unaryExpr, '+', 'x'] satisfies tinyest.UnaryExpression)).toBe(
          '+x',
        );
      });

      it('handles void', () => {
        expect(
          stringifyExpression([N.unaryExpr, 'void', 'x'] satisfies tinyest.UnaryExpression),
        ).toBe('void x');
      });

      it('handles delete', () => {
        expect(
          stringifyExpression([N.unaryExpr, 'delete', 'x'] satisfies tinyest.UnaryExpression),
        ).toBe('delete x');
      });

      it('wraps complex inner for symbol operator', () => {
        const node: tinyest.UnaryExpression = [N.unaryExpr, '!', [N.binaryExpr, 'a', '===', 'b']];
        expect(stringifyExpression(node)).toBe('!(a === b)');
      });

      it('wraps complex inner for word operator', () => {
        const node: tinyest.UnaryExpression = [
          N.unaryExpr,
          'typeof',
          [N.binaryExpr, 'a', '+', 'b'],
        ];
        expect(stringifyExpression(node)).toBe('typeof (a + b)');
      });

      it('handles post-update --', () => {
        expect(stringifyExpression([N.postUpdate, '--', 'i'] satisfies tinyest.PostUpdate)).toBe(
          'i--',
        );
      });

      it('handles pre-update ++', () => {
        expect(stringifyExpression([N.preUpdate, '++', 'i'] satisfies tinyest.PreUpdate)).toBe(
          '++i',
        );
      });
    });

    describe('logical operators', () => {
      it('handles || (logical OR)', () => {
        expect(
          stringifyExpression([N.logicalExpr, 'a', '||', 'b'] satisfies tinyest.LogicalExpression),
        ).toBe('a || b');
      });

      it('handles ?? (nullish coalescing)', () => {
        expect(
          stringifyExpression([N.logicalExpr, 'a', '??', 'b'] satisfies tinyest.LogicalExpression),
        ).toBe('a ?? b');
      });

      it('wraps left-side nested logical', () => {
        const node: tinyest.LogicalExpression = [
          N.logicalExpr,
          [N.logicalExpr, 'a', '&&', 'b'],
          '||',
          'c',
        ];
        expect(stringifyExpression(node)).toBe('(a && b) || c');
      });

      it('wraps right-side nested logical', () => {
        const node: tinyest.LogicalExpression = [
          N.logicalExpr,
          'a',
          '&&',
          [N.logicalExpr, 'b', '||', 'c'],
        ];
        expect(stringifyExpression(node)).toBe('a && (b || c)');
      });
    });

    describe('binary operators', () => {
      it('handles ** (exponentiation)', () => {
        expect(
          stringifyExpression([N.binaryExpr, 'a', '**', 'b'] satisfies tinyest.BinaryExpression),
        ).toBe('a ** b');
      });

      it('handles in', () => {
        expect(
          stringifyExpression([
            N.binaryExpr,
            'key',
            'in',
            'obj',
          ] satisfies tinyest.BinaryExpression),
        ).toBe('key in obj');
      });

      it('handles instanceof', () => {
        expect(
          stringifyExpression([
            N.binaryExpr,
            'x',
            'instanceof',
            'Foo',
          ] satisfies tinyest.BinaryExpression),
        ).toBe('x instanceof Foo');
      });
    });

    describe('compound assignment operators', () => {
      it('handles +=', () => {
        const node: tinyest.AssignmentExpression = [
          N.assignmentExpr,
          'x',
          '+=',
          [N.numericLiteral, '1'],
        ];
        expect(stringifyExpression(node)).toBe('x += 1');
      });

      it('handles -=', () => {
        expect(
          stringifyExpression([
            N.assignmentExpr,
            'x',
            '-=',
            'y',
          ] satisfies tinyest.AssignmentExpression),
        ).toBe('x -= y');
      });

      it('handles **=', () => {
        expect(
          stringifyExpression([
            N.assignmentExpr,
            'x',
            '**=',
            'y',
          ] satisfies tinyest.AssignmentExpression),
        ).toBe('x **= y');
      });

      it('handles ??=', () => {
        expect(
          stringifyExpression([
            N.assignmentExpr,
            'x',
            '??=',
            'y',
          ] satisfies tinyest.AssignmentExpression),
        ).toBe('x ??= y');
      });

      it('handles ||=', () => {
        expect(
          stringifyExpression([
            N.assignmentExpr,
            'x',
            '||=',
            'y',
          ] satisfies tinyest.AssignmentExpression),
        ).toBe('x ||= y');
      });

      it('handles &&=', () => {
        expect(
          stringifyExpression([
            N.assignmentExpr,
            'x',
            '&&=',
            'y',
          ] satisfies tinyest.AssignmentExpression),
        ).toBe('x &&= y');
      });
    });

    describe('wrapIfComplex behavior', () => {
      it('wraps conditional as binary operand', () => {
        const node: tinyest.BinaryExpression = [
          N.binaryExpr,
          [N.conditionalExpr, 'a', 'b', 'c'],
          '+',
          'x',
        ];
        expect(stringifyExpression(node)).toBe('(a ? b : c) + x');
      });

      it('wraps assignment inside binary', () => {
        const node: tinyest.BinaryExpression = [
          N.binaryExpr,
          'x',
          '+',
          [N.assignmentExpr, 'y', '=', [N.numericLiteral, '1']],
        ];
        expect(stringifyExpression(node)).toBe('x + (y = 1)');
      });

      it('wraps post-update inside binary', () => {
        const node: tinyest.BinaryExpression = [N.binaryExpr, [N.postUpdate, '++', 'i'], '+', 'x'];
        expect(stringifyExpression(node)).toBe('(i++) + x');
      });

      it('wraps pre-update inside binary', () => {
        const node: tinyest.BinaryExpression = [N.binaryExpr, [N.preUpdate, '++', 'i'], '+', 'x'];
        expect(stringifyExpression(node)).toBe('(++i) + x');
      });

      it('wraps object expression inside binary', () => {
        const node: tinyest.BinaryExpression = [
          N.binaryExpr,
          [N.objectExpr, { a: [N.numericLiteral, '1'] }],
          '+',
          'x',
        ];
        expect(stringifyExpression(node)).toBe('({ a: 1 }) + x');
      });

      it('wraps logical as conditional test', () => {
        const node: tinyest.ConditionalExpression = [
          N.conditionalExpr,
          [N.logicalExpr, 'a', '&&', 'b'],
          'x',
          'y',
        ];
        expect(stringifyExpression(node)).toBe('(a && b) ? x : y');
      });

      it('wraps nested conditional as consequent', () => {
        const node: tinyest.ConditionalExpression = [
          N.conditionalExpr,
          'a',
          [N.conditionalExpr, 'b', 'c', 'd'],
          'e',
        ];
        expect(stringifyExpression(node)).toBe('a ? (b ? c : d) : e');
      });

      it('wraps conditional as call callee', () => {
        const node: tinyest.Call = [N.call, [N.conditionalExpr, 'flag', 'funcA', 'funcB'], ['x']];
        expect(stringifyExpression(node)).toBe('(flag ? funcA : funcB)(x)');
      });

      it('wraps binary as index-access object', () => {
        const node: tinyest.IndexAccess = [
          N.indexAccess,
          [N.binaryExpr, 'a', '+', 'b'],
          [N.numericLiteral, '0'],
        ];
        expect(stringifyExpression(node)).toBe('(a + b)[0]');
      });

      it('does not wrap array expression as index-access object', () => {
        const node: tinyest.IndexAccess = [
          N.indexAccess,
          [N.arrayExpr, ['a', 'b', 'c']],
          [N.numericLiteral, '1'],
        ];
        expect(stringifyExpression(node)).toBe('[a, b, c][1]');
      });

      it('wraps all three conditional parts when they are complex', () => {
        const node: tinyest.ConditionalExpression = [
          N.conditionalExpr,
          [N.logicalExpr, 'a', '&&', 'b'],
          [N.binaryExpr, 'c', '+', 'd'],
          [N.logicalExpr, 'e', '||', 'f'],
        ];
        expect(stringifyExpression(node)).toBe('(a && b) ? (c + d) : (e || f)');
      });
    });

    describe('expression chaining', () => {
      it('handles call on call result', () => {
        const node: tinyest.Call = [N.call, [N.call, 'foo', []], [[N.numericLiteral, '1']]];
        expect(stringifyExpression(node)).toBe('foo()(1)');
      });

      it('handles member access on call result', () => {
        const node: tinyest.MemberAccess = [N.memberAccess, [N.call, 'foo', []], 'bar'];
        expect(stringifyExpression(node)).toBe('foo().bar');
      });

      it('handles call on member access (method call)', () => {
        const node: tinyest.Call = [N.call, [N.memberAccess, 'obj', 'method'], ['x']];
        expect(stringifyExpression(node)).toBe('obj.method(x)');
      });

      it('handles member access on index result', () => {
        const node: tinyest.MemberAccess = [
          N.memberAccess,
          [N.indexAccess, 'arr', [N.numericLiteral, '0']],
          'length',
        ];
        expect(stringifyExpression(node)).toBe('arr[0].length');
      });

      it('handles index access with complex index expression', () => {
        const node: tinyest.IndexAccess = [
          N.indexAccess,
          'arr',
          [N.binaryExpr, 'i', '+', [N.numericLiteral, '1']],
        ];
        expect(stringifyExpression(node)).toBe('arr[i + 1]');
      });

      it('handles index access on string literal', () => {
        const node: tinyest.IndexAccess = [
          N.indexAccess,
          [N.stringLiteral, 'hello'],
          [N.numericLiteral, '0'],
        ];
        expect(stringifyExpression(node)).toBe('"hello"[0]');
      });

      it('handles member access on string literal', () => {
        const node: tinyest.MemberAccess = [N.memberAccess, [N.stringLiteral, 'hello'], 'length'];
        expect(stringifyExpression(node)).toBe('"hello".length');
      });

      it('handles member access on boolean literal', () => {
        const node: tinyest.MemberAccess = [N.memberAccess, true, 'toString'];
        expect(stringifyExpression(node)).toBe('true.toString');
      });

      it('handles deeply chained member access', () => {
        const node: tinyest.MemberAccess = [
          N.memberAccess,
          [N.memberAccess, [N.memberAccess, 'a', 'b'], 'c'],
          'd',
        ];
        expect(stringifyExpression(node)).toBe('a.b.c.d');
      });
    });

    describe('string literal escaping', () => {
      it('escapes newlines', () => {
        const node: tinyest.Str = [N.stringLiteral, 'hello\nworld'];
        expect(stringifyExpression(node)).toBe('"hello\\nworld"');
      });

      it('escapes tabs', () => {
        const node: tinyest.Str = [N.stringLiteral, 'tab\there'];
        expect(stringifyExpression(node)).toBe('"tab\\there"');
      });

      it('escapes backslashes', () => {
        const node: tinyest.Str = [N.stringLiteral, 'back\\slash'];
        expect(stringifyExpression(node)).toBe('"back\\\\slash"');
      });

      it('handles empty string literal', () => {
        const node: tinyest.Str = [N.stringLiteral, ''];
        expect(stringifyExpression(node)).toBe('""');
      });
    });
  });

  describe('stringifyStatement', () => {
    describe('let/const without initializer', () => {
      it('handles let without initializer', () => {
        const node: tinyest.Let = [N.let, 'x'];
        expect(stringifyStatement(node)).toBe('let x;');
      });

      it('handles const without initializer', () => {
        const node: tinyest.Const = [N.const, 'y'];
        expect(stringifyStatement(node)).toBe('const y;');
      });
    });

    describe('for loop with missing parts', () => {
      it('handles infinite for loop (all parts null)', () => {
        const node: tinyest.For = [N.for, null, null, null, [N.block, []]];
        expect(stringifyStatement(node)).toMatchInlineSnapshot(`
          "for (; ; ) {

          }"
        `);
      });

      it('handles for loop with no init', () => {
        const cond: tinyest.BinaryExpression = [N.binaryExpr, 'i', '<', [N.numericLiteral, '10']];
        const update: tinyest.PostUpdate = [N.postUpdate, '++', 'i'];
        const node: tinyest.For = [N.for, null, cond, update, [N.block, []]];
        expect(stringifyStatement(node)).toMatchInlineSnapshot(`
          "for (; i < 10; i++) {

          }"
        `);
      });

      it('handles for loop with no condition', () => {
        const init: tinyest.Let = [N.let, 'i', [N.numericLiteral, '0']];
        const update: tinyest.PostUpdate = [N.postUpdate, '++', 'i'];
        const node: tinyest.For = [N.for, init, null, update, [N.block, []]];
        expect(stringifyStatement(node)).toMatchInlineSnapshot(`
          "for (let i = 0; ; i++) {

          }"
        `);
      });

      it('handles for loop with no update', () => {
        const init: tinyest.Let = [N.let, 'i', [N.numericLiteral, '0']];
        const cond: tinyest.BinaryExpression = [N.binaryExpr, 'i', '<', [N.numericLiteral, '10']];
        const node: tinyest.For = [N.for, init, cond, null, [N.block, []]];
        expect(stringifyStatement(node)).toMatchInlineSnapshot(`
          "for (let i = 0; i < 10; ) {

          }"
        `);
      });
    });

    describe('for-of with let binding', () => {
      it('handles for-of with let', () => {
        const node: tinyest.ForOf = [
          N.forOf,
          [N.let, 'item'],
          [N.arrayExpr, ['a', 'b', 'c']],
          [N.block, []],
        ];
        expect(stringifyStatement(node)).toMatchInlineSnapshot(`
          "for (let item of [a, b, c]) {

          }"
        `);
      });
    });

    describe('if without else', () => {
      it('handles if without else branch', () => {
        const body: tinyest.Block = [
          N.block,
          [[N.assignmentExpr, 'x', '=', [N.numericLiteral, '1']]],
        ];
        const node: tinyest.If = [N.if, 'condition', body];
        expect(stringifyStatement(node)).toMatchInlineSnapshot(`
          "if (condition) {
            x = 1;
          }"
        `);
      });
    });

    describe('expression statements', () => {
      it('handles assignment expression as statement', () => {
        const node: tinyest.AssignmentExpression = [
          N.assignmentExpr,
          'x',
          '=',
          [N.numericLiteral, '42'],
        ];
        expect(stringifyStatement(node)).toBe('x = 42;');
      });

      it('handles compound assignment as statement with indentation', () => {
        const node: tinyest.AssignmentExpression = [N.assignmentExpr, 'sum', '+=', 'value'];
        expect(stringifyStatement(node, '  ')).toBe('  sum += value;');
      });

      it('handles post-update as statement', () => {
        const node: tinyest.PostUpdate = [N.postUpdate, '++', 'count'];
        expect(stringifyStatement(node)).toBe('count++;');
      });
    });

    describe('return with complex expressions', () => {
      it('handles return with nested binary expression', () => {
        const node: tinyest.Return = [
          N.return,
          [N.binaryExpr, 'a', '*', [N.binaryExpr, 'b', '+', 'c']],
        ];
        expect(stringifyStatement(node)).toBe('return a * (b + c);');
      });

      it('handles return with conditional expression', () => {
        const node: tinyest.Return = [
          N.return,
          [N.conditionalExpr, 'flag', [N.numericLiteral, '1'], [N.numericLiteral, '0']],
        ];
        expect(stringifyStatement(node)).toBe('return flag ? 1 : 0;');
      });
    });

    describe('nested blocks', () => {
      it('handles nested block indentation', () => {
        const inner: tinyest.Block = [N.block, [[N.const, 'x', [N.numericLiteral, '1']]]];
        const outer: tinyest.Block = [N.block, [inner]];
        // Note: standalone blocks inside blocks don't get an extra leading indent —
        // only the *contents* are indented relative to the enclosing block.
        expect(stringifyStatement(outer)).toMatchInlineSnapshot(`
          "{
          {
              const x = 1;
            }
          }"
        `);
      });
    });

    describe('while with complex condition', () => {
      it('handles while with logical condition', () => {
        const cond: tinyest.LogicalExpression = [
          N.logicalExpr,
          [N.binaryExpr, 'x', '>', [N.numericLiteral, '0']],
          '&&',
          [N.binaryExpr, 'y', '<', [N.numericLiteral, '10']],
        ];
        const node: tinyest.While = [N.while, cond, [N.block, []]];
        expect(stringifyStatement(node)).toMatchInlineSnapshot(`
          "while ((x > 0) && (y < 10)) {

          }"
        `);
      });
    });
  });
});
