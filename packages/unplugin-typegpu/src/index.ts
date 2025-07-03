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
  isShellImplementationCall,
  kernelDirective,
  type Options,
  performExpressionNaming,
} from './common.ts';

type FunctionNode =
  | acorn.FunctionDeclaration
  | acorn.AnonymousFunctionDeclaration
  | acorn.FunctionExpression
  | acorn.ArrowFunctionExpression;

function containsKernelDirective(node: FunctionNode): boolean {
  if (node.body.type === 'BlockStatement') {
    for (const statement of node.body.body) {
      if (
        statement.type === 'ExpressionStatement' &&
        statement.directive === kernelDirective
      ) {
        return true;
      }
    }
  }
  return false;
}

function removeKernelDirective(node: FunctionNode) {
  const cloned = structuredClone(node);

  if (cloned.body.type === 'BlockStatement') {
    cloned.body.body = cloned.body.body.filter(
      (statement) =>
        !(
          statement.type === 'ExpressionStatement' &&
          statement.directive === kernelDirective
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
  magicString.prependLeft(
    node.start,
    '(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (',
  ).appendRight(
    node.end,
    `), ${metadata}) && $.f)({}))`,
  );
}

function wrapInAutoName(
  magicString: MagicStringAST,
  node: acorn.Node,
  name: string,
) {
  magicString
    .prependLeft(
      node.start,
      '((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(',
    )
    .appendRight(node.end, `, "${name}"))`);
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
            autoNamingEnabled: options.autoNamingEnabled,
          };

          const ast = this.parse(code, {
            allowReturnOutsideFunction: true,
          }) as Node;

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

          for (
            const {
              def,
              name,
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
              console.warn(
                `File ${id}: function "${name}" might have been referenced before its usage. Function statements are no longer hoisted after being transformed by the plugin.`,
              );
            }

            const metadata = `{
              v: ${FORMAT_VERSION},
              ast: ${embedJSON({ params, body, externalNames })},
              externals: {${externalNames.join(', ')}},
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
