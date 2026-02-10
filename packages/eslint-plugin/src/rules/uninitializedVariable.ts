import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';
import { createRule } from '../ruleCreator.ts';

export const uninitializedVariable = createRule({
  name: 'uninitialized-variable',
  meta: {
    type: 'problem',
    docs: {
      description:
        `Always assign an initial value when declaring a variable inside TypeGPU functions.`,
    },
    messages: {
      uninitializedVariable: '{{snippet}} should have an initial value.',
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
