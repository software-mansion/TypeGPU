import { createRule } from '../ruleCreator.ts';

export const noLongImports = createRule({
  name: 'no-long-imports',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow long import paths (to be used in TypeGPU examples), except common.',
    },
    messages: {
      unexpected:
        "Import path '{{path}}' probably won't work on StackBlitz, use imports from packages instead",
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      ImportDeclaration(node) {
        const importPath = node.source.value;
        if (importPath.startsWith('../../') && !importPath.startsWith('../../common/')) {
          context.report({
            node,
            messageId: 'unexpected',
            data: { path: importPath },
          });
        }
      },
    };
  },
});
