import defu from 'defu';
import MagicString from 'magic-string';
import { getBabelParserOptions, getLang } from 'ast-kit';
import type { UnpluginBuildContext, UnpluginContext, UnpluginFactory } from 'unplugin';
import _traverse, { type NodePath } from '@babel/traverse';
import type { Externals, TranspilationResult } from 'tinyest-for-wgsl';
import * as parser from '@babel/parser';
import * as t from '@babel/types';
import {
  defaultOptions,
  earlyPruneRegex,
  initPluginState,
  functionVisitor,
  getBlockScope,
  checkOpts,
} from './common.ts';
import { META_HELPER, metaHelperDeclaration, metadataJSON } from './metadataFormat.ts';

import type { Options, UnpluginPluginState, MetadatableFunction, NodeLocation } from './common.ts';

// I love CommonJS 💔
let traverse = _traverse;
if (typeof (traverse as unknown as { default: typeof traverse }).default === 'function') {
  traverse = (traverse as unknown as { default: typeof traverse }).default;
}

/**
 * Embeds a JSON string inside a single-quoted JS string literal.
 * JSON uses double quotes, so they don't need escaping.
 */
function jsonToStringLiteral(json: string) {
  const escaped = json
    .replaceAll('\\', '\\\\')
    .replaceAll("'", "\\'")
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  return `'${escaped}'`;
}

function externalsToString(externals: Externals): string {
  const entries = Array.from(externals, ([key, value]) => `"${key}":() => ${value}`);
  return `{${entries.join(',')}}`;
}

function assignMetadata(
  this: UnpluginPluginState,
  path: NodePath<MetadatableFunction>,
  name: string | undefined,
  ast: TranspilationResult,
): void {
  const args = [
    this.slice(path.node),
    jsonToStringLiteral(metadataJSON(ast)),
    externalsToString(ast.externalNames),
    ...(name ? [JSON.stringify(name)] : []),
  ];
  this.usesMetaHelper = true;

  const visibility = t.isFunctionDeclaration(path.node)
    ? getBlockScope(path as NodePath<t.FunctionDeclaration>)
    : undefined;

  let nodeToOverride: t.Node = path.node;
  // The function is not wrapped in parentheses: minifiers keep them, and V8 then compiles it
  // eagerly (PIFE heuristic), even though most 'use gpu' functions never run on the CPU
  let code = `(/*#__PURE__*/${META_HELPER}(${args.join(', ')}))`;
  let insertPos = path.node.start ?? 0;

  if (t.isFunctionDeclaration(path.node) && path.node.id) {
    code = `let ${path.node.id.name} = ${code};\n\n`;
  }

  if (visibility) {
    // Hoisting the declaration to the top of the scope
    insertPos = visibility.node.body[0]?.start ?? insertPos;

    if (t.isExportNamedDeclaration(path.parent)) {
      nodeToOverride = path.parent;
      code = `export ${code}`;
    } else if (t.isExportDefaultDeclaration(path.parent)) {
      nodeToOverride = path.parent;

      if (t.isFunctionDeclaration(path.node) && path.node.id) {
        code = `${code}export { ${path.node.id.name} as default };`;
      } else {
        code = `export default ${code};`;
      }
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
  const options = checkOpts(defu(rawOptions, defaultOptions));

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

        if (state.usesMetaHelper) {
          // After the hashbang and directive prologue ('use strict', 'use client', ...)
          const lastDirective = ast.program.directives.at(-1);
          const helperPos = lastDirective?.end ?? ast.program.interpreter?.end ?? 0;
          const separator = helperPos === 0 ? '' : '\n';
          // `prependLeft`, so that it precedes declarations hoisted to the same position
          magicString.prependLeft(helperPos, `${separator}${metaHelperDeclaration}`);
        }

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
