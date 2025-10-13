import type * as acorn from 'acorn';
import defu from 'defu';
import { generateTransform, MagicStringAST } from 'magic-string-ast';
import {
  assignMetadata,
  containsUseGpuDirective,
  type Context,
  defaultOptions,
  earlyPruneRegex,
  embedJSON,
  type FunctionNode,
  gatherTgpuAliases,
  getFunctionName,
  isShellImplementationCall,
  type Options,
  performExpressionNaming,
  removeUseGpuDirective,
  wrapInAutoName,
} from './common.ts';
import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { type Node, walk } from 'estree-walker';
import { transpileFn } from 'tinyest-for-wgsl';
import { FORMAT_VERSION } from 'tinyest';

export const rollUpImpl = (rawOptions: Options) => {
  const options = defu(rawOptions, defaultOptions);

  return {
    name: 'unplugin-typegpu' as const,
    enforce: options.enforce,
    transform: {
      filter: options.earlyPruning
        ? {
          id: options,
          code: earlyPruneRegex,
        }
        : {
          id: options,
        },
      handler(
        this: UnpluginBuildContext & UnpluginContext,
        code: string,
        id: string,
      ) {
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
            allowReturnOutsideFunction: true,
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
            const parent = _parent as acorn.AnyNode;

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
                    def: removeUseGpuDirective(implementation),
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
              if (containsUseGpuDirective(node)) {
                tgslFunctionDefs.push({
                  def: removeUseGpuDirective(node),
                  name: getFunctionName(node, parent),
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
              name: ${name ? `"${name}"` : 'undefined'},
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
