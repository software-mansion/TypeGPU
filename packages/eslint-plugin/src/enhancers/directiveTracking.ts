import type {
  RuleContext,
  RuleListener,
} from '@typescript-eslint/utils/ts-eslint';
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
export const directiveTracking: RuleEnhancer<DirectiveData> = (
  context: RuleContext<string, unknown[]>,
) => {
  const stack: string[][] = [];

  const visitors: RuleListener = {
    FunctionDeclaration() {
      // TODO: actually detect directives
      stack.push(['use gpu']);
    },
    FunctionExpression() {
      // TODO: actually detect directives
      stack.push(['use gpu']);
    },
    ArrowFunctionExpression() {
      // TODO: actually detect directives
      stack.push(['use gpu']);
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
