import type * as acorn from 'acorn';
import defu from 'defu';
import { generateTransform, MagicStringAST } from 'magic-string-ast';
import {
  type Context,
  defaultOptions,
  earlyPruneRegex,
  embedJSON,
  gatherTgpuAliases,
  getFunctionName,
  isShellImplementationCall,
  operators,
  type Options,
  performExpressionNaming,
  useGpuDirective,
} from './common.ts';
import type { UnpluginBuildContext, UnpluginContext } from 'unplugin';
import { type Node, walk } from 'estree-walker';
import { transpileFn } from 'tinyest-for-wgsl';
import { FORMAT_VERSION } from 'tinyest';

export type FunctionNode =
  | acorn.FunctionDeclaration
  | acorn.AnonymousFunctionDeclaration
  | acorn.FunctionExpression
  | acorn.ArrowFunctionExpression;

export function containsUseGpuDirective(node: FunctionNode): boolean {
  if (node.body.type === 'BlockStatement') {
    for (const statement of node.body.body) {
      if (statement.type === 'ExpressionStatement' && statement.directive === useGpuDirective) {
        return true;
      }
    }
  }
  return false;
}

function objectDestructuringError(message: string): Error {
  return new Error(`Unsupported object destructuring in "use gpu" functions: ${message}`);
}

function hasObjectPatternDeclaration(node: acorn.VariableDeclaration): boolean {
  return node.declarations.some((decl) => decl.id.type === 'ObjectPattern');
}

function cloneIdentifierNode(node: acorn.Identifier): acorn.AnyNode {
  return structuredClone(node);
}

function createMemberExpression(
  object: acorn.Expression,
  propertyName: string,
): acorn.AnyNode {
  return {
    type: 'MemberExpression',
    object: structuredClone(object),
    property: { type: 'Identifier', name: propertyName },
    computed: false,
  } as acorn.AnyNode;
}

function expandObjectPatternDeclaration(
  node: acorn.VariableDeclaration,
  sliceNode: (node: acorn.Node) => string,
  getTmpId: () => string,
): { declarations: acorn.AnyNode[]; replacement: string } | null {
  if (!hasObjectPatternDeclaration(node)) {
    return null;
  }

  const expanded: acorn.AnyNode[] = [];
  const declarations: string[] = [];

  for (const declarator of node.declarations) {
    if (declarator.id.type === 'Identifier') {
      expanded.push({
        type: 'VariableDeclaration',
        kind: node.kind,
        declarations: [structuredClone(declarator)],
      } as acorn.AnyNode);

      declarations.push(
        `${node.kind} ${declarator.id.name}${
          declarator.init ? ` = ${sliceNode(declarator.init)}` : ''
        };`,
      );
      continue;
    }

    if (declarator.id.type !== 'ObjectPattern') {
      throw objectDestructuringError('only flat object patterns are supported');
    }

    if (!declarator.init) {
      throw objectDestructuringError('an initializer is required');
    }

    let objectSourceStr = sliceNode(declarator.init);
    let objectSourceAst = declarator.init as acorn.Expression;

    if (objectSourceAst.type !== 'Identifier') {
      const tmpName = getTmpId();
      objectSourceStr = tmpName;
      objectSourceAst = {
        type: 'Identifier',
        name: tmpName,
      } as acorn.AnyNode as acorn.Identifier;

      expanded.push({
        type: 'VariableDeclaration',
        kind: node.kind,
        declarations: [
          {
            type: 'VariableDeclarator',
            id: structuredClone(objectSourceAst),
            init: declarator.init,
          },
        ],
      } as acorn.AnyNode);

      declarations.push(`${node.kind} ${tmpName} = ${sliceNode(declarator.init)};`);
    }

    for (const property of declarator.id.properties) {
      if (property.type === 'RestElement') {
        throw objectDestructuringError('rest properties are not supported');
      }

      if (property.type !== 'Property') {
        throw objectDestructuringError('only plain object properties are supported');
      }

      if (property.computed || property.key.type !== 'Identifier') {
        throw objectDestructuringError('only identifier property names are supported');
      }

      if (property.value.type !== 'Identifier') {
        if (property.value.type === 'AssignmentPattern') {
          throw objectDestructuringError('default values are not supported');
        }

        throw objectDestructuringError('nested destructuring is not supported');
      }

      expanded.push({
        type: 'VariableDeclaration',
        kind: node.kind,
        declarations: [
          {
            type: 'VariableDeclarator',
            id: cloneIdentifierNode(property.value),
            init: createMemberExpression(objectSourceAst, property.key.name),
          },
        ],
      } as acorn.AnyNode);

      declarations.push(`${node.kind} ${property.value.name} = ${objectSourceStr}.${property.key.name};`);
    }
  }

  return { declarations: expanded, replacement: declarations.join(' ') };
}

function normalizeObjectDestructuring(
  node: acorn.AnyNode,
  replaceNode: (node: acorn.Node, content: string) => void,
  sliceNode: (node: acorn.Node) => string,
) {
  let tmpCounter = 0;
  const getTmpId = () => {
    const id = tmpCounter === 0 ? '_tmp' : `_tmp${tmpCounter}`;
    tmpCounter++;
    return id;
  };

  walk(node as Node, {
    enter(current, parent) {
      const currentNode = current as acorn.AnyNode;
      const parentNode = parent as acorn.AnyNode | undefined;

      if (
        currentNode.type === 'VariableDeclaration' &&
        hasObjectPatternDeclaration(currentNode) &&
        parentNode?.type !== 'BlockStatement' &&
        parentNode?.type !== 'Program'
      ) {
        throw objectDestructuringError(
          'unsupported object destructuring in non-block variable declaration (e.g. for-loop initializer or for-of/in)',
        );
      }
    },
  });

  const rewriteBody = (body: acorn.AnyNode[]) => {
    const nextBody: acorn.AnyNode[] = [];

    for (const statement of body) {
      if (statement.type === 'VariableDeclaration') {
        const expanded = expandObjectPatternDeclaration(statement, sliceNode, getTmpId);
        if (expanded) {
          replaceNode(statement, expanded.replacement);
          nextBody.push(...expanded.declarations);
          continue;
        }
      }

      if (statement.type === 'BlockStatement') {
        rewriteBody(statement.body);
      } else if (statement.type === 'IfStatement') {
        if (statement.consequent.type === 'BlockStatement') {
          rewriteBody(statement.consequent.body);
        }
        if (statement.alternate?.type === 'BlockStatement') {
          rewriteBody(statement.alternate.body);
        }
      } else if (
        statement.type === 'ForStatement' &&
        statement.body.type === 'BlockStatement'
      ) {
        rewriteBody(statement.body.body);
      } else if (
        statement.type === 'WhileStatement' &&
        statement.body.type === 'BlockStatement'
      ) {
        rewriteBody(statement.body.body);
      }

      nextBody.push(statement);
    }

    body.splice(0, body.length, ...nextBody);
  };

  if (node.body.type === 'BlockStatement') {
    rewriteBody(node.body.body);
  }
}

export function removeUseGpuDirective(node: FunctionNode) {
  const cloned = structuredClone(node);

  if (cloned.body.type === 'BlockStatement') {
    cloned.body.body = cloned.body.body.filter(
      (statement) =>
        !(statement.type === 'ExpressionStatement' && statement.directive === useGpuDirective),
    );
  }

  return cloned;
}

export function assignMetadata(magicString: MagicStringAST, node: acorn.AnyNode, metadata: string) {
  magicString
    .prependLeft(node.start, '(($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (')
    .appendRight(node.end, `), ${metadata}) && $.f)({}))`);
}

export function wrapInAutoName(magicString: MagicStringAST, node: acorn.Node, name: string) {
  magicString
    .prependLeft(node.start, '((globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(')
    .appendRight(node.end, `, "${name}"))`);
}

export const rollUpImpl = (rawOptions: Options) => {
  const options = defu(rawOptions, defaultOptions);

  return {
    name: 'unplugin-typegpu' as const,
    enforce: options.enforce,
    transform: {
      filter: options.earlyPruning
        ? {
            id: options,
            code: earlyPruneRegex,
          }
        : {
            id: options,
          },
      handler(this: UnpluginBuildContext & UnpluginContext, code: string, id: string) {
        const ctx: Context = {
          tgpuAliases: new Set<string>(options.forceTgpuAlias ? [options.forceTgpuAlias] : []),
          fileId: id,
          autoNamingEnabled: options.autoNamingEnabled,
        };

        let ast: Node;
        try {
          ast = this.parse(code, {
            lang: 'ts',
            allowReturnOutsideFunction: true,
          }) as Node;
        } catch (cause) {
          console.warn(
            `[unplugin-typegpu] Failed to parse ${id}. Cause: ${
              typeof cause === 'object' && cause && 'message' in cause ? cause.message : cause
            }`,
          );
          return undefined;
        }

        const tgslFunctionDefs: {
          def: FunctionNode;
          name?: string | undefined;
        }[] = [];

        const magicString = new MagicStringAST(code);

        walk(ast, {
          enter(_node, _parent) {
            const node = _node as acorn.AnyNode;
            const parent = _parent as acorn.AnyNode;

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
                  const def = removeUseGpuDirective(implementation);
                  normalizeObjectDestructuring(
                    def,
                    (targetNode, content) => magicString.overwriteNode(targetNode as Node, content),
                    (targetNode) => magicString.sliceNode(targetNode as Node),
                  );
                  tgslFunctionDefs.push({ def });
                  this.skip();
                }
              }
            }

            if (
              node.type === 'ArrowFunctionExpression' ||
              node.type === 'FunctionExpression' ||
              node.type === 'FunctionDeclaration'
            ) {
              if (containsUseGpuDirective(node)) {
                const def = removeUseGpuDirective(node);
                normalizeObjectDestructuring(
                  def,
                  (targetNode, content) => magicString.overwriteNode(targetNode as Node, content),
                  (targetNode) => magicString.sliceNode(targetNode as Node),
                );
                tgslFunctionDefs.push({
                  def,
                  name: getFunctionName(node, parent),
                });
                this.skip();
              }
            }
          },
        });

        for (const { def, name } of tgslFunctionDefs) {
          const { params, body, externalNames } = transpileFn(def);
          const isFunctionStatement = def.type === 'FunctionDeclaration';

          walk(def as Node, {
            leave(_node) {
              const node = _node as acorn.AnyNode;

              if (node.type === 'AssignmentExpression') {
                const runtimeFn = operators[node.operator as keyof typeof operators];

                if (runtimeFn) {
                  const left = node.left;
                  const right = node.right;

                  const lhs = magicString.sliceNode(left);
                  const rhs = magicString.sliceNode(right);
                  magicString.overwriteNode(node, `${lhs} = ${runtimeFn}(${lhs}, ${rhs})`);
                }
              } else if (node.type === 'BinaryExpression') {
                const runtimeFn = operators[node.operator as keyof typeof operators];

                if (runtimeFn) {
                  const left = node.left;
                  const right = node.right;

                  const lhs = magicString.sliceNode(left);
                  const rhs = magicString.sliceNode(right);
                  magicString.overwriteNode(node, `${runtimeFn}(${lhs}, ${rhs})`);
                }
              }
            },
          });

          if (
            isFunctionStatement &&
            name &&
            code.slice(0, def.start).search(new RegExp(`(?<![\\w_.])${name}(?![\\w_])`)) !== -1
          ) {
            console.warn(
              `File ${id}: function "${name}" might have been referenced before its usage. Function statements are no longer hoisted after being transformed by the plugin.`,
            );
          }

          const metadata = `{
              v: ${FORMAT_VERSION},
              name: ${name ? `"${name}"` : 'undefined'},
              ast: ${embedJSON({ params, body, externalNames })},
              externals: () => ({${externalNames
                .map((e) => (e === 'this' ? '"this": this' : e))
                .join(', ')}}),
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
};
