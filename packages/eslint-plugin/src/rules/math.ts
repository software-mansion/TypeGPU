import { createRule } from '../ruleCreator.ts';
import { enhanceRule } from '../enhanceRule.ts';
import { directiveTracking } from '../enhancers/directiveTracking.ts';

export const math = createRule({
  name: 'math',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        `Disallow usage of JavaScript 'Math' methods inside 'use gpu' functions; use 'std' instead.`,
    },
    messages: {
      math:
        "Using Math methods, such as '{{snippet}}', is not advised, and may not work as expected. Use 'std' instead.",
    },
    schema: [],
  },
  defaultOptions: [],

  create: enhanceRule({ directives: directiveTracking }, (context, state) => {
    const { directives } = state;

    return {
      CallExpression(node) {
        if (!directives.insideUseGpu()) {
          return;
        }

        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.object.type === 'Identifier' &&
          node.callee.object.name === 'Math'
        ) {
          context.report({
            node,
            messageId: 'math',
            data: { snippet: context.sourceCode.getText(node) },
          });
        }
      },
    };
  }),
});
