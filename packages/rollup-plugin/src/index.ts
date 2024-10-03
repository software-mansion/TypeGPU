import type {
  AnyNode,
  ArrowFunctionExpression,
  VariableDeclarator,
} from 'acorn';
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
  implementation: ArrowFunctionExpression;
};

function gatherTgpuAliases(ctx: Context, node: AnyNode) {
  if (node.type === 'ImportDeclaration') {
    if (
      node.source.value === 'typegpu' ||
      node.source.value === 'typegpu/experimental'
    ) {
      for (const spec of node.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          // The default export of both 'typegpu' and 'typegpu/experimental' is the `tgpu` object.
          ctx.tgpuAliases.add(spec.local.name);
        } else if (
          spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'tgpu'
        ) {
          // Aliasing 'tgpu' while importing, e.g. import { tgpu as t } from 'typegpu';
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
    if (node.type === 'MemberExpression') {
      if (node.property.type !== 'Identifier') {
        // Not handling computed expressions.
        break;
      }

      path = path ? `${node.property.name}.${path}` : node.property.name;
      tail = node.object;
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
              node.callee.property.type === 'Identifier' &&
              node.callee.property.name === 'procedure' &&
              isTgpu(ctx, node.callee.object) &&
              node.arguments.length === 1
            ) {
              const implementation = node.arguments[0];

              if (implementation?.type === 'ArrowFunctionExpression') {
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
        magicString.appendRight(expr.varDecl.end, '.$__ast({  }).$uses({  })');
      }

      return {
        code: magicString.toString(),
        map: magicString.generateMap(),
      };
    },
  };
}
