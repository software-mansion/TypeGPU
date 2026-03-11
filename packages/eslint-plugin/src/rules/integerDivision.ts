import type { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../ruleCreator.ts';

// TODO: detect `std.div(d.u32(1), d.u32(2))`
export const integerDivision = createRule({
  name: 'integer-division',
  meta: {
    type: 'suggestion',
    docs: { description: `Avoid dividing numbers wrapped in 'u32' and 'i32'.` },
    messages: {
      intDiv:
        "'{{snippet}}' might result in floating point values. To perform integer division, wrap the result in 'd.u32' or 'd.i32' instead.",
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      BinaryExpression(node) {
        if (node.operator !== '/') {
          return;
        }

        if (node.parent?.type === 'CallExpression' && isIntCast(node.parent)) {
          return;
        }

        if (isIntCast(node.left) || isIntCast(node.right)) {
          context.report({
            node,
            messageId: 'intDiv',
            data: { snippet: context.sourceCode.getText(node) },
          });
        }
      },
    };
  },
});

/**
 * Checks if a node is a call expression to an integer cast function (i32 or u32).
 *
 * @example
 * // for simplicity, using code snippets instead of ASTs
 * isIntCasts('d.u32()'); // true
 * isIntCasts('i32()'); // true
 * isIntCasts('f32()'); // false
 */
function isIntCast(node: TSESTree.Expression): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }

  let callee: TSESTree.Node = node.callee;
  while (callee.type === 'MemberExpression') {
    callee = callee.property;
  }

  return callee.type === 'Identifier' && ['i32', 'u32'].includes(callee.name);
}
