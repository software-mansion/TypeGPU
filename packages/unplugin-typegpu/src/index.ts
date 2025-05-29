import type * as acorn from 'acorn';
import defu from 'defu';
import { type Node, walk } from 'estree-walker';
import { generateTransform, MagicStringAST } from 'magic-string-ast';
import { FORMAT_VERSION } from 'tinyest';
import { transpileFn } from 'tinyest-for-wgsl';
import { createUnplugin, type UnpluginInstance } from 'unplugin';
import babel from './babel.ts';
import {
  type Context,
  defaultOptions,
  embedJSON,
  gatherTgpuAliases,
  getErrorMessage,
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

function assignMetadata(
  magicString: MagicStringAST,
  node: acorn.AnyNode,
  metadata: string,
) {
  magicString.appendLeft(
    node.start,
    `(($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
                $.f = (`,
  ).appendRight(
    node.end,
    `) , ${metadata}) && $.f))({})`,
  );
}

function tryAssignName(
  magicString: MagicStringAST,
  node: acorn.Node,
  name: string,
) {
  magicString
    .appendLeft(node.start, '$autoName(')
    .appendRight(node.end, `, ${name})`);
}

function includeAutoNameFunction(magicString: MagicStringAST) {
  magicString.append(`
function $autoName(exp, label) {
  return exp?.$name ? exp.$name(label) : exp;
}`);
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

              if (
                node.type === 'VariableDeclarator' &&
                node.id.type === 'Identifier' &&
                node.init
              ) {
                tryAssignName(magicString, node.init, node.id.name);
              }

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

            const metadata = `{
              v: ${FORMAT_VERSION},
              ast: ${embedJSON({ params, body, externalNames })},
              externals: {${externalNames.join(', ')}},
            }`;

            if (isFunctionStatement && name) {
              magicString.appendLeft(def.start, `const ${name} = `);
            }

            assignMetadata(magicString, def, metadata);

            if (removeJsImplementation) {
              magicString.overwriteNode(
                def,
                `() => {
                  throw new Error(\`${getErrorMessage(name)}\`);
                }`,
              );
            }
          }

          includeAutoNameFunction(magicString);
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
