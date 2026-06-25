import { createRule } from '../ruleCreator.ts';

export const noTgpuNamespaceImport = createRule({
  name: 'no-tgpu-namespace-import',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow `import tgpu`',
    },
    messages: {
      oldImport: '`import tgpu` should be replaced with `import { tgpu }`.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      ImportDeclaration(node) {
        if (
          node.specifiers.some(
            (specifier) =>
              specifier.type === 'ImportDefaultSpecifier' && specifier.local.name === 'tgpu',
          )
        ) {
          context.report({
            node,
            messageId: 'oldImport',
          });
        }
      },
    };
  },
});
