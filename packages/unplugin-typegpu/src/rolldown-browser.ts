import type { Plugin } from 'rolldown';
import type * as acorn from 'acorn';
import { type Node, walk } from 'estree-walker';
import {
  assignMetadata,
  containsKernelDirective,
  type Context,
  defaultOptions,
  earlyPruneRegex,
  embedJSON,
  type FunctionNode,
  gatherTgpuAliases,
  isShellImplementationCall,
  type Options,
  performExpressionNaming,
  removeKernelDirective,
  wrapInAutoName,
} from './common.ts';
import defu from 'defu';
import { generateTransform, MagicStringAST } from 'magic-string-ast';
import { FORMAT_VERSION } from 'tinyest';
import { transpileFn } from 'tinyest-for-wgsl';

export default (rawOptions: Options): Plugin => {
  const options = defu(rawOptions, defaultOptions);
  return {
    name: 'unplugin-typegpu' as const,
    transform: {
      filter: options.earlyPruning
        ? {
          id: options,
          code: earlyPruneRegex,
        }
        : {
          id: options,
        },
      handler(code, id) {
        const ctx: Context = {
          tgpuAliases: new Set<string>(
            options.forceTgpuAlias ? [options.forceTgpuAlias] : [],
          ),
          fileId: id,
          autoNamingEnabled: options.autoNamingEnabled,
        };

        let ast: Node;
        try {
          ast = this.parse(code, {
            lang: 'ts',
          }) as Node;
        } catch (cause) {
          console.warn(
            `[unplugin-typegpu] Failed to parse ${id}. Cause: ${
              typeof cause === 'object' && cause && 'message' in cause
                ? cause.message
                : cause
            }`,
          );
          return undefined;
        }

        const tgslFunctionDefs: {
          def: FunctionNode;
          name?: string | undefined;
        }[] = [];

        const magicString = new MagicStringAST(code);

        walk(ast, {
          enter(_node, _parent, prop, index) {
            const node = _node as acorn.AnyNode;

            performExpressionNaming(ctx, node, (node, name) => {
              wrapInAutoName(magicString, node, name);
            });

            if (node.type === 'ImportDeclaration') {
              gatherTgpuAliases(node, ctx);
            }

            if (node.type === 'CallExpression') {
              if (isShellImplementationCall(node, ctx)) {
                const implementation = node.arguments[0];

                if (
                  implementation &&
                  (implementation.type === 'FunctionExpression' ||
                    implementation.type === 'ArrowFunctionExpression')
                ) {
                  tgslFunctionDefs.push({
                    def: removeKernelDirective(implementation),
                  });
                  this.skip();
                }
              }
            }

            if (
              node.type === 'ArrowFunctionExpression' ||
              node.type === 'FunctionExpression' ||
              node.type === 'FunctionDeclaration'
            ) {
              if (containsKernelDirective(node)) {
                tgslFunctionDefs.push({
                  def: removeKernelDirective(node),
                  name: node.type === 'FunctionDeclaration' ||
                      node.type === 'FunctionExpression'
                    ? node.id?.name
                    : _parent?.type === 'VariableDeclarator'
                    ? _parent.id.type === 'Identifier'
                      ? _parent.id.name
                      : undefined
                    : undefined,
                });
                this.skip();
              }
            }
          },
        });

        for (const { def, name } of tgslFunctionDefs) {
          const { params, body, externalNames } = transpileFn(def);
          const isFunctionStatement = def.type === 'FunctionDeclaration';

          if (
            isFunctionStatement &&
            name &&
            code.slice(0, def.start)
                .search(new RegExp(`(?<![\\w_.])${name}(?![\\w_])`)) !== -1
          ) {
            console.warn(
              `File ${id}: function "${name}" might have been referenced before its usage. Function statements are no longer hoisted after being transformed by the plugin.`,
            );
          }

          const metadata = `{
            v: ${FORMAT_VERSION},
            ast: ${embedJSON({ params, body, externalNames })},
            get externals() { return {${externalNames.join(', ')}}; },
          }`;

          assignMetadata(magicString, def, metadata);

          if (isFunctionStatement && name) {
            magicString.prependLeft(def.start, `const ${name} = `);
          }
        }

        return generateTransform(magicString, id);
      },
    },
  };
};
