import type { AnyNode, CallExpression } from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import type { Plugin, SourceMap } from 'rollup';
import { transpileFn } from 'tinyest-for-wgsl';

const typegpuImportRegex = /import.*from\s*['"]typegpu.*['"]/g;
const typegpuDynamicImportRegex = /import\s*\(\s*['"]\s*typegpu.*['"]/g;
const typegpuRequireRegex = /require\s*\(\s*['"]\s*typegpu.*['"]\s*\)/g;

type Context = {
  /**
   * How the `tgpu` object is used in code. Since it can be aliased, we
   * need to catch that and act accordingly.
   */
  tgpuAliases: Set<string>;
};

type TgslFunctionDef = {
  varDecl: CallExpression;
  implementation: AnyNode;
};

function embedJSON(jsValue: unknown) {
  return JSON.stringify(jsValue)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function gatherTgpuAliases(ctx: Context, node: AnyNode) {
  if (node.type === 'ImportDeclaration') {
    if (
      node.source.value === 'typegpu' ||
      node.source.value === 'typegpu/experimental'
    ) {
      for (const spec of node.specifiers) {
        if (
          // The default export of both 'typegpu' and 'typegpu/experimental' is the `tgpu` object.
          spec.type === 'ImportDefaultSpecifier' ||
          // Aliasing 'tgpu' while importing, e.g. import { tgpu as t } from 'typegpu';
          (spec.type === 'ImportSpecifier' &&
            spec.imported.type === 'Identifier' &&
            spec.imported.name === 'tgpu')
        ) {
          ctx.tgpuAliases.add(spec.local.name);
        } else if (spec.type === 'ImportNamespaceSpecifier') {
          // Importing everything, e.g. import * as t from 'typegpu';
          ctx.tgpuAliases.add(`${spec.local.name}.tgpu`);
        }
      }
    }
  }
}

/**
 * Checks if `node` is an alias for the 'tgpu' object, traditionally
 * available via `import tgpu from 'typegpu'`.
 */
function isTgpu(ctx: Context, node: AnyNode): boolean {
  let path = '';

  let tail = node;
  while (true) {
    if (tail.type === 'MemberExpression') {
      if (tail.property.type !== 'Identifier') {
        // Not handling computed expressions.
        break;
      }

      path = path ? `${tail.property.name}.${path}` : tail.property.name;
      tail = tail.object;
    } else if (tail.type === 'Identifier') {
      path = path ? `${tail.name}.${path}` : tail.name;
      break;
    } else {
      break;
    }
  }

  return ctx.tgpuAliases.has(path);
}

export interface TypegpuPluginOptions {
  include?: 'all' | RegExp[];
}

export interface TypegpuPlugin {
  name: 'rollup-plugin-typegpu';
  transform(
    code: string,
    id: string,
  ): { code: string; map: SourceMap } | undefined;
}

export default function typegpu(options?: TypegpuPluginOptions): TypegpuPlugin {
  return {
    name: 'rollup-plugin-typegpu' as const,
    transform(code, id) {
      if (!options?.include) {
        if (
          !typegpuImportRegex.test(code) &&
          !typegpuRequireRegex.test(code) &&
          !typegpuDynamicImportRegex.test(code)
        ) {
          // No imports to `typegpu` or its sub modules, exiting early.
          return;
        }
      } else if (
        options.include !== 'all' &&
        !options.include.some((pattern) => pattern.test(id))
      ) {
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

          gatherTgpuAliases(ctx, node);

          if (node.type === 'CallExpression') {
            if (
              node.callee.type === 'MemberExpression' &&
              node.arguments.length === 1 &&
              node.callee.property.type === 'Identifier' &&
              ((node.callee.property.name === 'procedure' &&
                isTgpu(ctx, node.callee.object)) ||
                // Assuming that every call to `.does` is related to TypeGPU
                // because shells can be created separately from calls to `tgpu`,
                // making it hard to detect.
                node.callee.property.name === 'does')
            ) {
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
