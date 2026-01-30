import { createRule } from '../ruleCreator.ts';
import { enhanceRule } from '../ruleEnhancer.ts';
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

  create: enhanceRule({ tracking: directiveTracking }, (context, state) => {
    return {
      ObjectExpression(node) {
        if (state.tracking.current().includes('use gpu')) {
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
