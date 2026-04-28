import defu from 'defu';
import { generateTransform, MagicStringAST } from 'magic-string-ast';
import { getBabelParserOptions, getLang } from 'ast-kit';
import type { UnpluginBuildContext, UnpluginContext, UnpluginFactory } from 'unplugin';
import _traverse, { type NodePath } from '@babel/traverse';
import { FORMAT_VERSION } from 'tinyest';
import { transpileFn } from 'tinyest-for-wgsl';
import * as parser from '@babel/parser';
import { t } from './babel-types.ts';
import {
  defaultOptions,
  earlyPruneRegex,
  initPluginState,
  functionVisitor,
  getBlockScope,
} from './common.ts';

import type { Options, UnpluginPluginState, MetadatableFunction } from './common.ts';

// I love CommonJS 💔
let traverse = _traverse;
if (typeof (traverse as unknown as { default: typeof traverse }).default === 'function') {
  traverse = (traverse as unknown as { default: typeof traverse }).default;
}

const fnWrapperTemplate = (fnCode: string, metadata: string) =>
  `(/*#__PURE__*/($ => (globalThis.__TYPEGPU_META__ ??= new WeakMap()).set($.f = (${fnCode}), ${metadata}) && $.f)({}))`;

function embedJSON(jsValue: unknown) {
  return JSON.stringify(jsValue)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function assignMetadata(
  this: UnpluginPluginState,
  path: NodePath<MetadatableFunction>,
  name: string | undefined,
  ast: ReturnType<typeof transpileFn>,
): void {
  const metadata = `{
    v: ${FORMAT_VERSION},
    name: ${name ? `"${name}"` : 'undefined'},
    ast: ${embedJSON(ast)},
    externals: () => ({${ast.externalNames
      .map((e) => (e === 'this' ? '"this": this' : e))
      .join(', ')}}),
  }`;

  const visibility = t.isFunctionDeclaration(path.node)
    ? getBlockScope(path as NodePath<t.FunctionDeclaration>)
    : undefined;

  const fnCode = this.magicString.sliceNode(path.node);

  let nodeToOverride: t.Node = path.node;
  let code = fnWrapperTemplate(fnCode, metadata);
  let insertPos = path.node.start ?? 0;

  if (t.isFunctionDeclaration(path.node) && path.node.id) {
    code = `const ${path.node.id.name} = ${code};\n\n`;
  }

  if (visibility) {
    // Hoisting the declaration to the top of the scope
    insertPos = visibility.node.body[0]?.start ?? insertPos;

    if (t.isExportNamedDeclaration(path.parent)) {
      nodeToOverride = path.parent;
      code = `export ${code}`;
    }
  }

  if (insertPos < (path.node.start ?? 0)) {
    for (const comment of nodeToOverride.leadingComments?.toReversed() ?? []) {
      code = `${this.magicString.slice(comment.start ?? 0, comment.end ?? 0)}\n${code}`;
      this.magicString.removeNode(comment);
    }
    this.magicString.removeNode(nodeToOverride);
    this.magicString.prependLeft(insertPos, code);
  } else {
    this.magicString.overwriteNode(nodeToOverride, code);
  }
}

function wrapInAutoName(
  this: UnpluginPluginState,
  path: NodePath<t.Expression>,
  name: string,
): void {
  this.magicString
    .appendLeft(
      path.node.start ?? 0,
      '(/*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(',
    )
    .prependRight(path.node.end ?? 0, `, "${name}"))`);
}

function replaceWithAssignmentOverload(
  this: UnpluginPluginState,
  path: NodePath<t.AssignmentExpression>,
  runtimeFn: string,
): void {
  const lhs = this.magicString.sliceNode(path.node.left);
  const rhs = this.magicString.sliceNode(path.node.right);
  this.magicString.overwriteNode(path.node, `${lhs} = ${runtimeFn}(${lhs}, ${rhs})`);
}

function replaceWithBinaryOverload(
  this: UnpluginPluginState,
  path: NodePath<t.BinaryExpression>,
  runtimeFn: string,
): void {
  const lhs = this.magicString.sliceNode(path.node.left);
  const rhs = this.magicString.sliceNode(path.node.right);
  this.magicString.overwriteNode(path.node, `${runtimeFn}(${lhs}, ${rhs})`);
}

export const unpluginFactory = ((rawOptions, _meta) => {
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
        let ast: parser.ParseResult;
        try {
          ast = parser.parse(
            code,
            getBabelParserOptions(getLang(id), {
              sourceType: 'module',
              allowReturnOutsideFunction: true,
            }),
          );
        } catch (cause) {
          console.warn(
            `[unplugin-typegpu] Failed to parse ${id}. Cause: ${
              typeof cause === 'object' && cause && 'message' in cause ? cause.message : cause
            }`,
          );
          return undefined;
        }

        const magicString = new MagicStringAST(code);

        const state = {
          filename: id,
          magicString,
          opts: options,
        } as UnpluginPluginState;

        initPluginState(state, {
          warn: (message) => this.warn(message),
          assignMetadata,
          wrapInAutoName,
          replaceWithAssignmentOverload,
          replaceWithBinaryOverload,
        });

        traverse(ast, functionVisitor, undefined, state);

        return generateTransform(magicString, id);
      },
    },
  };
}) satisfies UnpluginFactory<Options | undefined, false>;
