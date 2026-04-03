import { createRule } from '../ruleCreator.ts';

export const noMath = createRule({
  name: 'no-math',
  meta: {
    type: 'suggestion',
    docs: {
      description: `Disallow usage of JavaScript 'Math' methods inside 'use gpu' functions`,
    },
    messages: {
      unexpected:
        "Using Math methods, such as '{{snippet}}', may not work as expected. Use 'std' instead",
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      CallExpression(node) {
        context.report({
          node,
          messageId: 'unexpected',
          data: { snippet: context.sourceCode.getText(node) },
        });
      },
    };
  },
});
