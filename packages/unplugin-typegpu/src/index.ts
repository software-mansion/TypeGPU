import type * as acorn from 'acorn';
import defu from 'defu';
import { type Node, walk } from 'estree-walker';
import { generateTransform, MagicStringAST } from 'magic-string-ast';
import { transpileFn } from 'tinyest-for-wgsl';
import { createUnplugin, type UnpluginInstance } from 'unplugin';
import babel from './babel.ts';
import {
  codeFilterRegexes,
  type Context,
  defaultOptions,
  embedJSON,
  gatherTgpuAliases,
  isShellImplementationCall,
  type KernelDirective,
  kernelDirectives,
  type Options,
} from './common.ts';

type FunctionNode =
  | acorn.FunctionDeclaration
  | acorn.AnonymousFunctionDeclaration
  | acorn.FunctionExpression
  | acorn.ArrowFunctionExpression;

function getKernelDirective(node: FunctionNode): KernelDirective | undefined {
  if (node.body.type === 'BlockStatement') {
    for (const statement of node.body.body) {
      if (statement.type === 'ExpressionStatement') {
        if (kernelDirectives.includes(statement.directive as KernelDirective)) {
          return statement.directive as KernelDirective;
        }
      }
    }
  }
}

function removeKernelDirective(node: FunctionNode) {
  const cloned = structuredClone(node);

  if (cloned.body.type === 'BlockStatement') {
    cloned.body.body = cloned.body.body.filter(
      (statement) =>
        !(
          statement.type === 'ExpressionStatement' &&
          statement.directive &&
          kernelDirectives.includes(statement.directive as KernelDirective)
        ),
    );
  }

  return cloned;
}

const typegpu: UnpluginInstance<Options, false> = createUnplugin(
  (rawOptions) => {
    const options = defu(rawOptions, defaultOptions);

    return {
      name: 'unplugin-typegpu' as const,
      enforce: options.enforce,
      transform: {
        filter: {
          id: options,
          ...(options.forceTgpuAlias ? {} : { code: codeFilterRegexes }),
        },
        handler(code, id) {
          const ctx: Context = {
            tgpuAliases: new Set<string>(
              options.forceTgpuAlias ? [options.forceTgpuAlias] : [],
            ),
            fileId: id,
          };

          const ast = this.parse(code, {
            allowReturnOutsideFunction: true,
          }) as Node;

          const tgslFunctionDefs: {
            def: FunctionNode;
            name?: string | undefined;
            removeJsImplementation: boolean;
          }[] = [];

          const magicString = new MagicStringAST(code);

          walk(ast, {
            enter(_node, _parent, prop, index) {
              const node = _node as acorn.AnyNode;

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
                    const directive = getKernelDirective(implementation);
                    tgslFunctionDefs.push({
                      def: removeKernelDirective(implementation),
                      removeJsImplementation: directive !== 'kernel & js',
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
                const directive = getKernelDirective(node);
                if (directive) {
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
                    removeJsImplementation: directive !== 'kernel & js',
                  });
                  this.skip();
                }
              }
            },
          });

          const tgpuAlias = ctx.tgpuAliases.values().next().value;

          if (tgpuAlias === undefined && tgslFunctionDefs.length > 0) {
            throw new Error(
              `No tgpu import found, cannot assign ast to function in file: ${id}`,
            );
          }

          for (
            const {
              def,
              name,
              removeJsImplementation,
            } of tgslFunctionDefs
          ) {
            const { params, body, externalNames } = transpileFn(def);
            const isFunctionStatement = def.type === 'FunctionDeclaration';

            if (
              isFunctionStatement &&
              name &&
              code
                  .slice(0, def.start)
                  .search(new RegExp(`(?<![\\w_.])${name}(?![\\w_])`)) !== -1
            ) {
              throw new Error(
                `File ${id}: function "${name}", containing ${
                  removeJsImplementation ? 'kernel' : 'kernel & js'
                } directive, is referenced before its usage. Function statements are no longer hoisted after being transformed by the plugin.`,
              );
            }

            // Wrap the implementation in a call to `tgpu.__assignAst` to associate the AST with the implementation.
            magicString.appendLeft(
              def.start,
              `${
                isFunctionStatement && name ? `const ${name} = ` : ''
              }${tgpuAlias}.__assignAst(`,
            );
            magicString.appendRight(
              def.end,
              `, ${embedJSON({ params, body, externalNames })}`,
            );

            if (externalNames.length > 0) {
              magicString.appendRight(
                def.end,
                `, {${externalNames.join(', ')}})`,
              );
            } else {
              magicString.appendRight(
                def.end,
                `)${isFunctionStatement && name ? ';' : ''}`,
              );
            }

            if (removeJsImplementation) {
              magicString.overwriteNode(
                def,
                `${tgpuAlias}.__removedJsImpl(${name ? `"${name}"` : ''})`,
              );
            }
          }

          return generateTransform(magicString, id);
        },
      },
    };
  },
);

export type { Options } from './common.ts';

export default typegpu;

export const vitePlugin = typegpu.vite;
export const rollupPlugin = typegpu.rollup;
export const rolldownPlugin = typegpu.rolldown;
export const webpackPlugin = typegpu.webpack;
export const rspackPlugin = typegpu.rspack;
export const esbuildPlugin = typegpu.esbuild;
export const farmPlugin = typegpu.farm;
export const babelPlugin = babel;
