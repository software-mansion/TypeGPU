import type {
  RuleContext,
  RuleListener,
} from '@typescript-eslint/utils/ts-eslint';
import type { RuleEnhancer } from '../enhanceRule.ts';

export type DirectiveList = {
  current: () => string[];
};

/**
 * A RuleEnhancer that exposes the list of directives of the currently parsed function scope.
 * TODO (when needed): switch to a map from function node to a list of directives, and implement top level directive tracking
 */
export const directiveTracking: RuleEnhancer<DirectiveList> = (
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
    state: { current: () => stack.at(-1) ?? [] },
  };
};
