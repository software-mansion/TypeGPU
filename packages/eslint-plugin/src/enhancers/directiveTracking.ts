import type {
  RuleContext,
  RuleListener,
} from '@typescript-eslint/utils/ts-eslint';
import type { RuleEnhancer } from '../ruleEnhancer.ts';

export type FunctionDirectiveList = {
  current: () => string[];
};

export const directiveTracking: RuleEnhancer<FunctionDirectiveList> = (
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
