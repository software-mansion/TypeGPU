import type { TSESTree } from '@typescript-eslint/utils';
import type { RuleListener } from '@typescript-eslint/utils/ts-eslint';
import type { RuleEnhancer } from '../enhanceRule.ts';

export type DirectiveData = {
  insideUseGpu: () => boolean;
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
  const stack: string[][] = [];

  const visitors: RuleListener = {
    FunctionDeclaration(node) {
      stack.push(getDirectives(node));
    },
    FunctionExpression(node) {
      stack.push(getDirectives(node));
    },
    ArrowFunctionExpression(node) {
      stack.push(getDirectives(node));
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
    state: { insideUseGpu: () => (stack.at(-1) ?? []).includes('use gpu') },
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
