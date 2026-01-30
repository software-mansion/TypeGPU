import { createRule } from '../ruleCreator.ts';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';

export const unwrappedPojos = createRule({
  name: 'AAA',
  meta: {
    type: 'problem',
    docs: {
      description: `Always wrap plain old javascript objects with schemas.`,
    },
    messages: {
      unwrappedPojo: '{{snippet}}',
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    return {
      ObjectExpression(node) {
        if (directives.insideUseGpu()) {
          context.report({
            node,
            messageId: 'unwrappedPojo',
            data: { snippet: context.sourceCode.getText(node) },
          });
        }
      },
    };
  }),
});
