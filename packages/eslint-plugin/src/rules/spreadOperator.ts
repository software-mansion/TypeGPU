import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

export const spreadOperator = createRule({
  name: 'spread-operator',
  meta: {
    type: 'problem',
    docs: {
      description: `Do not use the spread operator inside TypeGPU functions.`,
    },
    messages: {
      spreadOperator: "'{{snippet}}' is invalid inside of a TypeGPU function.",
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    return {
      SpreadElement(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        context.report({
          node,
          messageId: 'spreadOperator',
          data: { snippet: context.sourceCode.getText(node) },
        });
      },
    };
  }),
});
