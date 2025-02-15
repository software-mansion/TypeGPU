import type { AnyNode, CallExpression } from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import type { Plugin, SourceMap } from 'rollup';
import { transpileFn } from 'tinyest-for-wgsl';
import {
  type Context,
  type TypegpuPluginOptions,
  embedJSON,
  gatherTgpuAliases,
  isDoesCall,
  shouldSkipFile,
} from './common';

type TgslFunctionDef = {
  varDecl: CallExpression;
  implementation: AnyNode;
};

export interface TypegpuRollupPlugin {
  name: 'rollup-plugin-typegpu';
  transform(
    code: string,
    id: string,
  ): { code: string; map: SourceMap } | undefined;
}

export default function typegpu(
  options?: TypegpuPluginOptions,
): TypegpuRollupPlugin {
  return {
    name: 'rollup-plugin-typegpu' as const,
    transform(code, id) {
      if (shouldSkipFile(options, id, code)) {
        return;
      }

      const ctx: Context = {
        tgpuAliases: new Set(['tgpu']),
      };

      const ast = this.parse(code, {
        allowReturnOutsideFunction: true,
      });

      const tgslFunctionDefs: TgslFunctionDef[] = [];

      walk(ast, {
        enter(_node, _parent, prop, index) {
          const node = _node as AnyNode;

          if (node.type === 'ImportDeclaration') {
            gatherTgpuAliases(node, ctx);
          }

          if (node.type === 'CallExpression') {
            if (isDoesCall(node, ctx)) {
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

      for (const expr of tgslFunctionDefs) {
        const { argNames, body, externalNames } = transpileFn(
          expr.implementation,
        );

        // Wrap the implementation in a call to `tgpu.__assignAst` to associate the AST with the implementation.
        magicString.appendLeft(expr.implementation.start, 'tgpu.__assignAst(');
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
          magicString.appendRight(expr.implementation.end, ', undefined)');
        }
      }

      return {
        code: magicString.toString(),
        map: magicString.generateMap(),
      };
    },
  } satisfies Plugin;
}
