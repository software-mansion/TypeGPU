import defu from 'defu';
import MagicString from 'magic-string';
import { getBabelParserOptions, getLang } from 'ast-kit';
import type { UnpluginBuildContext, UnpluginContext, UnpluginFactory } from 'unplugin';
import _traverse, { type NodePath } from '@babel/traverse';
import { transpileFn } from 'tinyest-for-wgsl';
import * as parser from '@babel/parser';
import * as t from '@babel/types';
import {
  defaultOptions,
  earlyPruneRegex,
  initPluginState,
  functionVisitor,
  getBlockScope,
  METADATA_FORMAT_VERSION,
} from './common.ts';

import type { Options, UnpluginPluginState, MetadatableFunction, NodeLocation } from './common.ts';

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
    v: ${METADATA_FORMAT_VERSION},
    name: ${name ? `"${name}"` : 'undefined'},
    ast: ${embedJSON(ast)},
    externals: () => ({${ast.externalNames
      .map((e) => (e === 'this' ? '"this": this' : e))
      .join(', ')}}),
  }`;

  const visibility = t.isFunctionDeclaration(path.node)
    ? getBlockScope(path as NodePath<t.FunctionDeclaration>)
    : undefined;

  const fnCode = this.slice(path.node);

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
      if (comment) {
        code = `${this.slice(comment)}\n${code}`;
        this.remove(comment);
      }
    }
    this.remove(nodeToOverride);
    this.magicString.prependLeft(insertPos, code);
  } else {
    this.overwrite(nodeToOverride, code);
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
  const lhs = this.slice(path.node.left);
  const rhs = this.slice(path.node.right);
  this.overwrite(path.node, `${lhs} = ${runtimeFn}(${lhs}, ${rhs})`);
}

function replaceWithBinaryOverload(
  this: UnpluginPluginState,
  path: NodePath<t.BinaryExpression>,
  runtimeFn: string,
): void {
  const lhs = this.slice(path.node.left);
  const rhs = this.slice(path.node.right);
  this.overwrite(path.node, `${runtimeFn}(${lhs}, ${rhs})`);
}

const NodeUtils = {
  slice(this: UnpluginPluginState, node: NodeLocation): string {
    return this.magicString.slice(node.start ?? 0, node.end ?? 0);
  },
  remove(this: UnpluginPluginState, node: NodeLocation): void {
    this.magicString.remove(node.start ?? 0, node.end ?? 0);
  },
  overwrite(this: UnpluginPluginState, node: NodeLocation, content: string): void {
    this.magicString.overwrite(node.start ?? 0, node.end ?? 0, content);
  },
};

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

        const magicString = new MagicString(code);

        const state = {
          filename: id,
          magicString,
          opts: options,
          ...NodeUtils,
        } as UnpluginPluginState;

        initPluginState(state, {
          warn: (message) => this.warn(message),
          assignMetadata,
          wrapInAutoName,
          replaceWithAssignmentOverload,
          replaceWithBinaryOverload,
        });

        traverse(ast, functionVisitor, undefined, state);

        if (magicString.hasChanged()) {
          return {
            code: magicString.toString(),
            get map() {
              return magicString.generateMap({
                source: id,
                includeContent: true,
                hires: 'boundary',
              });
            },
          };
        }

        return undefined;
      },
    },
  };
}) satisfies UnpluginFactory<Options | undefined, false>;
