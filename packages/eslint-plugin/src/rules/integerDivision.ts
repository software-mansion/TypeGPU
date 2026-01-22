import type { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../ruleCreator.ts';

/**
 * Checks if a node is a call expression to an integer cast function (i32 or u32).
 *
 * @example
 * hasIntCasts('d.u32()'); // true
 * hasIntCasts('i32()'); // true
 * hasIntCasts('f32()'); // false
 */
function hasIntCasts(node: TSESTree.Expression): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }

  let callee: TSESTree.Node = node.callee;
  while (callee.type === 'MemberExpression') {
    callee = callee.property;
  }

  return callee.type === 'Identifier' && ['i32', 'u32'].includes(callee.name);
}

export const integerDivision = createRule({
  name: 'integer-division',
  meta: {
    type: 'suggestion',
    docs: { description: `Avoid dividing numbers wrapped in 'u32' and 'i32'.` },
    messages: {
      intDiv:
        "'{{node}}' will result in floating point values. To perform integer division, wrap the result in 'd.u32' or 'd.i32' instead.",
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

        if (hasIntCasts(node.left) && hasIntCasts(node.right)) {
          context.report({
            node: node,
            messageId: 'intDiv',
            data: { node: context.sourceCode.getText(node) },
          });
        }
      },
    };
  },
});
