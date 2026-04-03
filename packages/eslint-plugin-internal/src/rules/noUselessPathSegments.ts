import { createRule } from '../ruleCreator.ts';
import * as path from 'node:path';

export const noUselessPathSegments = createRule({
  name: 'no-useless-path-segments',
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: {
      description: 'Disallow redundant parent folder lookups in relative import paths',
    },
    messages: {
      redundant: "Import path '{{path}}' can be simplified to '{{simplified}}'",
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    return {
      ImportDeclaration(node) {
        const importPath = node.source.value;
        if (!importPath.startsWith('.')) {
          return;
        }

        const filename = context.filename; // e.g. `/Users/me/typegpu-monorepo/packages/typegpu/tests/buffer.test.ts`
        const dir = path.dirname(filename); // e.g. `/Users/me/typegpu-monorepo/packages/typegpu/tests`
        const resolved = path.resolve(dir, importPath); // e.g. `/Users/me/typegpu-monorepo/packages/typegpu/src/data/index.ts`
        let simplified = path.relative(dir, resolved); // e.g. `../src/data/index.ts`, or `subfolder/helper.ts`

        if (!simplified.startsWith('..')) {
          simplified = `./${simplified}`;
        }

        if (importPath !== simplified) {
          context.report({
            node,
            messageId: 'redundant',
            data: { path: importPath, simplified },
            fix(fixer) {
              const quote = context.sourceCode.getText(node.source)[0];
              return fixer.replaceText(node.source, `${quote}${simplified}${quote}`);
            },
          });
        }
      },
    };
  },
});
