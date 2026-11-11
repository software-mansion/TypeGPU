import type { TSESTree } from '@typescript-eslint/utils';
import { createRule } from '../ruleCreator.ts';

function isTypegpuSource(source: string): boolean {
  return source === 'typegpu' || source.startsWith('typegpu/');
}

/**
 * Module instance files (`instantiate.ts`) ship in pruned bundles, which don't contain TypeGPU.
 * They can only import types from it, and get everything else from the definition.
 */
export const noRuntimeTypegpuImport = createRule({
  name: 'no-runtime-typegpu-import',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow value imports from `typegpu` in module instance files',
    },
    messages: {
      valueImport:
        'Instance files can only import types from `{{source}}`. Take schemas, layouts and pipelines from the definition instead.',
    },
    schema: [],
  },
  defaultOptions: [],

  create(context) {
    function check(
      node:
        | TSESTree.ImportDeclaration
        | TSESTree.ExportNamedDeclaration
        | TSESTree.ExportAllDeclaration,
    ) {
      const source = node.source?.value;
      if (typeof source !== 'string' || !isTypegpuSource(source)) {
        return;
      }

      if (node.type === 'ImportDeclaration') {
        if (node.importKind === 'type') {
          return;
        }
        const hasValue =
          node.specifiers.length === 0 ||
          node.specifiers.some(
            (specifier) => specifier.type !== 'ImportSpecifier' || specifier.importKind !== 'type',
          );
        if (!hasValue) {
          return;
        }
      } else if (node.exportKind === 'type') {
        return;
      } else if (
        node.type === 'ExportNamedDeclaration' &&
        node.specifiers.every((specifier) => specifier.exportKind === 'type')
      ) {
        return;
      }

      context.report({ node, messageId: 'valueImport', data: { source } });
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
});
