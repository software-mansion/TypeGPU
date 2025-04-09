import type * as acorn from 'acorn';
import { type Node, walk } from 'estree-walker';
import MagicString from 'magic-string';
import { transpileFn } from 'tinyest-for-wgsl';
import { type UnpluginFactory, createUnplugin } from 'unplugin';
import babel from './babel.ts';
import {
  type Context,
  type KernelDirective,
  type TypegpuPluginOptions,
  embedJSON,
  gatherTgpuAliases,
  isShellImplementationCall,
  kernelDirectives,
  shouldSkipFile,
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
  if (node.body.type === 'BlockStatement') {
    node.body.body = node.body.body.filter(
      (statement) =>
        !(
          statement.type === 'ExpressionStatement' &&
          statement.directive &&
          kernelDirectives.includes(statement.directive as KernelDirective)
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
      name?: string | undefined;
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
              const directive = getKernelDirective(implementation);
              tgslFunctionDefs.push({
                def: removeKernelDirective(implementation),
                removeJsImplementation: directive !== 'kernel & js',
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
              name:
                node.type === 'FunctionDeclaration' ||
                node.type === 'FunctionExpression'
                  ? node.id?.name
                  : _parent?.type === 'VariableDeclarator'
                    ? _parent.id.type === 'Identifier'
                      ? _parent.id.name
                      : undefined
                    : undefined,
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

    for (const { def, name, removeJsImplementation } of tgslFunctionDefs) {
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
          `File ${id}: function "${name}", containing ${removeJsImplementation ? 'kernel' : 'kernel & js'} directive, is referenced before its usage. Function statements are no longer hoisted after being transformed by the plugin.`,
        );
      }

      // Wrap the implementation in a call to `tgpu.__assignAst` to associate the AST with the implementation.
      magicString.appendLeft(
        def.start,
        `${isFunctionStatement && name ? `const ${name} = ` : ''}${tgpuAlias}.__assignAst(`,
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
          `)${isFunctionStatement && name ? ';' : ''}`,
        );
      }

      if (removeJsImplementation) {
        magicString.overwrite(
          def.start,
          def.end,
          `${tgpuAlias}.__removedJsImpl(${name ? `"${name}"` : ''})`,
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

export type { TypegpuPluginOptions } from './common.ts';

export default unplugin;

export const vitePlugin = unplugin.vite;
export const rollupPlugin = unplugin.rollup;
export const rolldownPlugin = unplugin.rolldown;
export const webpackPlugin = unplugin.webpack;
export const rspackPlugin = unplugin.rspack;
export const esbuildPlugin = unplugin.esbuild;
export const farmPlugin = unplugin.farm;
export const babelPlugin = babel;
