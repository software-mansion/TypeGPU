import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

export const noUninitializedVariables = createRule({
  name: 'no-uninitialized-variables',
  meta: {
    type: 'problem',
    docs: {
      description: `Disallow variable declarations without initializers inside 'use gpu' functions`,
    },
    messages: {
      uninitializedVariable: "'{{snippet}}' must have an initial value",
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    return {
      VariableDeclarator(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        if (node.parent?.parent?.type === 'ForOfStatement') {
          // one exception where we allow uninitialized variable
          return;
        }
        if (node.init === null) {
          context.report({
            node,
            messageId: 'uninitializedVariable',
            data: { snippet: context.sourceCode.getText(node) },
          });
        }
      },
    };
  }),
});
