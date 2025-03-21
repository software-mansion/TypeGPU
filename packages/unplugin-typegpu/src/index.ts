import type { AnyNode, CallExpression } from 'acorn';
import { type Node, walk } from 'estree-walker';
import MagicString from 'magic-string';
import { transpileFn } from 'tinyest-for-wgsl';
import { type UnpluginFactory, createUnplugin } from 'unplugin';
import babel from './babel';
import {
  type Context,
  type TypegpuPluginOptions,
  embedJSON,
  gatherTgpuAliases,
  isShellImplementationCall,
  shouldSkipFile,
} from './common';

type TgslFunctionDef = {
  varDecl: CallExpression;
  implementation: AnyNode;
};

const typegpu: UnpluginFactory<TypegpuPluginOptions> = (
  options: TypegpuPluginOptions,
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

    const tgslFunctionDefs: TgslFunctionDef[] = [];

    walk(ast, {
      enter(_node, _parent, prop, index) {
        const node = _node as AnyNode;

        if (node.type === 'ImportDeclaration') {
          gatherTgpuAliases(node, ctx);
        }

        if (node.type === 'CallExpression') {
          if (isShellImplementationCall(node, ctx)) {
            const implementation = node.arguments[0];

            if (
              implementation &&
              !(implementation.type === 'TemplateLiteral') &&
              !(implementation.type === 'Literal')
            ) {
              tgslFunctionDefs.push({
                varDecl: node,
                implementation,
              });
            }
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

    for (const expr of tgslFunctionDefs) {
      const { argNames, body, externalNames } = transpileFn(
        expr.implementation,
      );

      // Wrap the implementation in a call to `tgpu.__assignAst` to associate the AST with the implementation.
      magicString.appendLeft(
        expr.implementation.start,
        `${tgpuAlias}.__assignAst(`,
      );
      magicString.appendRight(
        expr.implementation.end,
        `, ${embedJSON({ argNames, body, externalNames })}`,
      );

      if (externalNames.length > 0) {
        magicString.appendRight(
          expr.implementation.end,
          `, {${externalNames.join(', ')}})`,
        );
      } else {
        magicString.appendRight(expr.implementation.end, ')');
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
