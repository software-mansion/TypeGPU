import { transpileFn } from '@typegpu/tgsl-tools';
import type { AnyNode, VariableDeclarator } from 'acorn';
import { walk } from 'estree-walker';
import MagicString from 'magic-string';
import type { Plugin } from 'rollup';

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
  varDecl: VariableDeclarator;
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

export default function typegpu(): Plugin {
  return {
    name: 'rollup-plugin-typegpu',
    transform(code, id) {
      if (
        !typegpuImportRegex.test(code) &&
        !typegpuRequireRegex.test(code) &&
        !typegpuDynamicImportRegex.test(code)
      ) {
        // No imports to `typegpu` or its sub modules, exiting early.
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
          const parent = _parent as AnyNode | null;
          // ^ all this to make TypeScript happy (  ◦°^°◦)

          gatherTgpuAliases(ctx, node);

          if (node.type === 'CallExpression') {
            if (
              parent?.type !== 'VariableDeclarator' ||
              parent.id.type !== 'Identifier'
            ) {
              // Skipping, as the resulting function needs to be stored in a variable.
              return;
            }

            if (
              node.callee.type === 'MemberExpression' &&
              node.arguments.length === 1 &&
              node.callee.property.type === 'Identifier' &&
              ((node.callee.property.name === 'procedure' &&
                isTgpu(ctx, node.callee.object)) ||
                // Assuming that every call to `.implement` is related to TypeGPU
                // because shells can be created separately from calls to `tgpu`,
                // making it hard to detect.
                // TODO: We can improve this by first checking if $__ast exists on this object
                // at runtime, before calling it.
                node.callee.property.name === 'implement')
            ) {
              const implementation = node.arguments[0];

              if (implementation) {
                tgslFunctionDefs.push({
                  varDecl: parent,
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

        magicString.appendRight(
          expr.varDecl.end,
          `.$__ast(${embedJSON(argNames)}, ${embedJSON(body)})`,
        );

        if (externalNames.length > 0) {
          magicString.appendRight(
            expr.varDecl.end,
            `.$uses({ ${externalNames.join(', ')} })`,
          );
        }
      }

      return {
        code: magicString.toString(),
        map: magicString.generateMap(),
      };
    },
  };
}
