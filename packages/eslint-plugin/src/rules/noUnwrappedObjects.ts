import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { getNonTransparentParent } from '../nodeHelpers.ts';
import { createRule } from '../ruleCreator.ts';

export const noUnwrappedObjects = createRule({
  name: 'no-unwrapped-objects',
  meta: {
    type: 'problem',
    docs: {
      description: `Disallow unwrapped Plain Old JavaScript Objects inside 'use gpu' functions (except returns)`,
    },
    messages: {
      unexpected: '{{snippet}} must be wrapped in a schema call',
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    return {
      ObjectExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }
        let parent = getNonTransparentParent(node);
        if (parent?.type === 'Property') {
          // a part of a bigger struct
          return;
        }
        if (parent?.type === 'CallExpression') {
          // wrapped in a schema call
          return;
        }
        if (parent?.type === 'ReturnStatement') {
          // likely inferred (shelled fn or shell-less entry) so we cannot report
          return;
        }
        context.report({
          node,
          messageId: 'unexpected',
          data: { snippet: context.sourceCode.getText(node) },
        });
      },
    };
  }),
});
