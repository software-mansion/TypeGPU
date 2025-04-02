import type * as acorn from 'acorn';
import { type Node, walk } from 'estree-walker';
import MagicString from 'magic-string';
import { transpileFn } from 'tinyest-for-wgsl';
import { type UnpluginFactory, createUnplugin } from 'unplugin';
import babel from './babel';
import {
  type Context,
  type KernelDirective,
  type TypegpuPluginOptions,
  embedJSON,
  gatherTgpuAliases,
  isShellImplementationCall,
  kernelDirectives,
  shouldSkipFile,
} from './common';

type FunctionNode =
  | acorn.FunctionDeclaration
  | acorn.AnonymousFunctionDeclaration
  | acorn.FunctionExpression
  | acorn.ArrowFunctionExpression;

function getKernelDirective(node: FunctionNode): KernelDirective | undefined {
  if (node.body.type === 'BlockStatement') {
    for (const statement of node.body.body) {
      for (const directive of kernelDirectives) {
        if (
          statement.type === 'ExpressionStatement' &&
          statement.directive === directive
        ) {
          return directive;
        }
      }
    }
  }
}

function removeKernelDirective(node: FunctionNode) {
  if (node.body.type === 'BlockStatement') {
    node.body.body = node.body.body.filter(
      (statement) =>
        !(
          statement.type === 'ExpressionStatement' &&
          statement.directive &&
          kernelDirectives.includes(
            statement.directive as (typeof kernelDirectives)[number],
          )
        ),
    );
  }

  return node;
}

const typegpu: UnpluginFactory<TypegpuPluginOptions> = (
  options: TypegpuPluginOptions = {},
) => ({
  name: 'unplugin-typegpu' as const,
  transform(code, id) {
    if (shouldSkipFile(options, id, code)) {
      return;
    }

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
      removeJsImplementation: boolean;
    }[] = [];

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
              tgslFunctionDefs.push({
                def: implementation,
                removeJsImplementation: true,
              });
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
              removeJsImplementation: directive !== 'kernel & js',
            });
          }
        }
      },
    });

    const magicString = new MagicString(code);
    const tgpuAlias = ctx.tgpuAliases.values().next().value;

    if (tgpuAlias === undefined && tgslFunctionDefs.length > 0) {
      throw new Error(
        `No tgpu import found, cannot assign ast to function in file: ${id}`,
      );
    }

    for (const { def, removeJsImplementation } of tgslFunctionDefs) {
      const { argNames, body, externalNames } = transpileFn(def);

      const functionStatementName =
        def.type === 'FunctionDeclaration' ? def.id?.name : undefined;

      if (
        functionStatementName &&
        code
          .slice(0, def.start)
          .search(
            new RegExp(`(?<![\\w_.])${functionStatementName}(?![\\w_])`),
          ) !== -1
      ) {
        throw new Error(
          `File ${id}: function "${functionStatementName}", containing ${removeJsImplementation ? 'kernel' : 'kernel & js'} directive, is referenced before its usage. Function statements are no longer hoisted after being transformed by the plugin.`,
        );
      }

      // Wrap the implementation in a call to `tgpu.__assignAst` to associate the AST with the implementation.
      magicString.appendLeft(
        def.start,
        `${functionStatementName ? `const ${functionStatementName} = ` : ''}${tgpuAlias}.__assignAst(`,
      );
      magicString.appendRight(
        def.end,
        `, ${embedJSON({ argNames, body, externalNames })}`,
      );

      if (externalNames.length > 0) {
        magicString.appendRight(def.end, `, {${externalNames.join(', ')}})`);
      } else {
        magicString.appendRight(
          def.end,
          `)${functionStatementName ? ';' : ''}`,
        );
      }

      if (removeJsImplementation) {
        magicString.overwrite(
          def.start,
          def.end,
          `${tgpuAlias}.__removedJsImpl(${functionStatementName ? `"${functionStatementName}"` : ''})`,
        );
      }
    }

    return {
      code: magicString.toString(),
      map: magicString.generateMap(),
    };
  },
});

const unplugin = createUnplugin(typegpu);

export type { TypegpuPluginOptions } from './common';

export default unplugin;

export const vitePlugin = unplugin.vite;
export const rollupPlugin = unplugin.rollup;
export const rolldownPlugin = unplugin.rolldown;
export const webpackPlugin = unplugin.webpack;
export const rspackPlugin = unplugin.rspack;
export const esbuildPlugin = unplugin.esbuild;
export const farmPlugin = unplugin.farm;
export const babelPlugin = babel;
