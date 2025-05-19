import type * as acorn from 'acorn';
import defu from 'defu';
import { type Node, walk } from 'estree-walker';
import { generateTransform, MagicStringAST } from 'magic-string-ast';
import { transpileFn } from 'tinyest-for-wgsl';
import { createUnplugin, type UnpluginInstance } from 'unplugin';
import babel from './babel.ts';
import {
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

          for (
            const {
              def,
              name, // AAA to name to nazwa funkcji, ogarnij heurę na to
              removeJsImplementation,
            } of tgslFunctionDefs
          ) {
            const { argNames, body, externalNames } = transpileFn(def);
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

            const metadata = `{
              ast: ${embedJSON({ argNames, body, externalNames })},
              externals: {${externalNames.join(', ')}},
            }`;

            // Wrap the implementation in a set to `globalThis` to associate the name, AST and externals with the implementation.
            magicString.appendLeft(
              def.start,
              `${isFunctionStatement && name ? `const ${name} = ` : ''}
              (($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                $.f = (`,
            ).appendRight(
              def.end,
              `) , ${metadata}) && $.f))({})`,
            );

            if (removeJsImplementation) {
              magicString.overwriteNode(
                def,
                `() => {
                  throw new Error(\`The function "${
                  name ?? '<unnamed>'
                }" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.\`);
                }`,
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
