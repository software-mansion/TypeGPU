import type { TSESTree } from '@typescript-eslint/utils';
import type { RuleListener } from '@typescript-eslint/utils/ts-eslint';
import type { RuleEnhancer } from '../enhanceRule.ts';

export type FunctionNode =
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression
  | TSESTree.ArrowFunctionExpression;

export type DirectiveData = {
  getEnclosingTypegpuFunction: () => FunctionNode | undefined;
  getDirectiveStack: () => { node: FunctionNode; directives: string[] }[];
};

/**
 * A RuleEnhancer that tracks whether the current node is inside a 'use gpu' function.
 *
 * @privateRemarks
 * Should the need arise, the API could be updated to expose:
 * - a list of directives of the current function,
 * - directives of other visited functions,
 * - top level directives.
 */
export const directiveTracking: RuleEnhancer<DirectiveData> = () => {
  const stack: { node: FunctionNode; directives: string[] }[] = [];

  const visitors: RuleListener = {
    FunctionDeclaration(node) {
      stack.push({ node, directives: getDirectives(node) });
    },
    FunctionExpression(node) {
      stack.push({ node, directives: getDirectives(node) });
    },
    ArrowFunctionExpression(node) {
      stack.push({ node, directives: getDirectives(node) });
    },

    'FunctionDeclaration:exit'() {
      stack.pop();
    },
    'FunctionExpression:exit'() {
      stack.pop();
    },
    'ArrowFunctionExpression:exit'() {
      stack.pop();
    },
  };

  return {
    visitors,
    state: {
      getEnclosingTypegpuFunction() {
        const current = stack.at(-1);
        if (current && current.directives.includes('use gpu')) {
          return current.node;
        }
        return undefined;
      },
      getDirectiveStack() {
        return stack;
      },
    },
  };
};

function getDirectives(
  node:
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression
    | TSESTree.ArrowFunctionExpression,
): string[] {
  const body = node.body;
  if (body.type !== 'BlockStatement') {
    return [];
  }

  const directives: string[] = [];
  for (const statement of body.body) {
    if (statement.type === 'ExpressionStatement' && statement.directive) {
      directives.push(statement.directive);
    } else {
      break;
    }
  }

  return directives;
}
