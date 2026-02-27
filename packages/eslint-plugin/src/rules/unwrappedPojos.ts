import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

export const unwrappedPojos = createRule({
  name: 'unwrapped-pojo',
  meta: {
    type: 'problem',
    docs: {
      description: `Wrap Plain Old JavaScript Objects with schemas.`,
    },
    messages: {
      unwrappedPojo:
        '{{snippet}} is a POJO that is not wrapped in a schema. To allow WGSL resolution, wrap it in a schema call. You only need to wrap the outermost object.',
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
        if (node.parent?.type === 'Property') {
          // a part of a bigger struct
          return;
        }
        if (node.parent?.type === 'CallExpression') {
          // wrapped in a schema call
          return;
        }
        if (node.parent?.type === 'ReturnStatement') {
          // likely inferred (shelled fn or shell-less entry) so we cannot report
          return;
        }
        context.report({
          node,
          messageId: 'unwrappedPojo',
          data: { snippet: context.sourceCode.getText(node) },
        });
      },
    };
  }),
});
