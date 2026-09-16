import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import type {
  Context,
  JsNode,
  TranspilationOptions,
  TranspilationResult,
  Transpile,
  Transpilers,
} from './types.ts';
import { tryFindExternalChain } from './externals.ts';
import {
  acornTranspilers,
  babelTranspilers,
  transpileAcornProperty,
  transpileBabelObjectProperty,
} from './transpilers.ts';
import { extractFunctionParts } from './functionParts.ts';

const { NodeTypeCatalog: NODE } = tinyest;

function createContext(params: tinyest.FuncParameter[], opts: TranspilationOptions): Context {
  return {
    externalNames: new Map(),
    ignoreExternalDepth: 0,
    visitedNodes: new Set(),
    stack: [
      {
        declaredNames: params.flatMap((param) =>
          param.type === tinyest.FuncParameterType.identifier
            ? param.name
            : param.props.map((prop) => prop.alias),
        ),
      },
    ],
    generatedSourceMap: new Map(),
    opts,
  };
}

function createLegacyTraspilers() {
  return {
    ...babelTranspilers,
    ...acornTranspilers,

    ObjectExpression(ctx, node, transpile) {
      const objectProperties = node.properties.map((prop) => {
        if (prop.type === 'SpreadElement') {
          throw new Error('Spread elements are not supported in TGSL.');
        }

        if (prop.type === 'ObjectMethod' || (prop.type === 'Property' && prop.method)) {
          throw new Error('Object method elements are not supported in TGSL.');
        }

        return prop.type === 'Property'
          ? transpileAcornProperty(ctx, prop, transpile)
          : transpileBabelObjectProperty(ctx, prop, transpile);
      });

      if (objectProperties.some((prop) => /* computed */ prop[2])) {
        return [NODE.objectExpr, objectProperties] as tinyest.ObjectExpression;
      }

      const obj: Record<string, tinyest.Expression> = {};
      const seenKeys = new Set<string>();

      for (const prop of objectProperties) {
        const key = prop[0] as string;
        if (seenKeys.has(key)) {
          throw new Error(`Duplicate object property key: '${key}'.`);
        }
        seenKeys.add(key);
        obj[key] = /* value */ prop[1];
      }

      return [NODE.objectExpr, obj] as tinyest.ObjectExpression;
    },
  } as Transpilers<JsNode>;
}

function createParser(kind: 'acorn' | 'babel' | 'legacy') {
  const transpilers = (
    kind === 'acorn'
      ? acornTranspilers
      : kind === 'babel'
        ? babelTranspilers
        : createLegacyTraspilers()
  ) as Transpilers<JsNode>;

  const transpile: Transpile<JsNode> = (ctx, node) => {
    const transpiler = transpilers[node.type];

    if (!transpiler) {
      throw new Error(`Unsupported JS functionality: ${node.type}`);
    }

    let result: tinyest.AnyNode;
    if (ctx.ignoreExternalDepth === 0) {
      // Check if the node is an external prop access chain, and if so,
      // add it to externals and swap the AST node for an identifier.
      const externalChain = tryFindExternalChain(ctx, node);
      if (externalChain) {
        ctx.externalNames.set(externalChain, externalChain);
        result = ctx.opts.verboseNodes ? [NODE.identifier, externalChain] : externalChain;
      }
    }
    // @ts-ignore <too much for typescript, it seems :/ >
    result ??= transpiler(ctx, node, transpile);

    if (Array.isArray(result)) {
      const maybeSource = ctx.opts.sourceMap?.(node);
      if (maybeSource) {
        ctx.generatedSourceMap.set(result, maybeSource);
      }
    }

    return result;
  };

  return {
    transpileFn(rootNode: JsNode, options: TranspilationOptions): TranspilationResult {
      const { params, body } = extractFunctionParts(rootNode);
      const ctx = createContext(params, options);

      const tinyestBody = transpile(ctx, body);

      if (body.type === 'BlockStatement') {
        return {
          params,
          body: tinyestBody as tinyest.Block,
          externalNames: ctx.externalNames,
          sourceMap: ctx.generatedSourceMap,
        };
      }

      return {
        params,
        body: [NODE.block, [[NODE.return, tinyestBody as tinyest.Expression]]],
        externalNames: ctx.externalNames,
        sourceMap: ctx.generatedSourceMap,
      };
    },

    transpileNode(node: JsNode, options: TranspilationOptions): tinyest.AnyNode {
      return transpile(createContext([], options), node);
    },
  };
}

const parsers = {
  acorn: createParser('acorn'),
  babel: createParser('babel'),
};

let legacyParser: ReturnType<typeof createParser> | undefined = undefined;

export function transpileAcornFn(
  rootNode: acorn.AnyNode,
  options: TranspilationOptions = {},
): TranspilationResult {
  return parsers.acorn.transpileFn(rootNode, options);
}

export function transpileAcornNode(
  rootNode: acorn.AnyNode,
  options: TranspilationOptions = {},
): tinyest.AnyNode {
  return parsers.acorn.transpileNode(rootNode, options);
}

export function transpileBabelFn(
  rootNode: babel.Node,
  options: TranspilationOptions = {},
): TranspilationResult {
  return parsers.babel.transpileFn(rootNode, options);
}

export function transpileBabelNode(
  rootNode: babel.Node,
  options: TranspilationOptions = {},
): tinyest.AnyNode {
  return parsers.babel.transpileNode(rootNode, options);
}

/**
 * @deprecated Use {@link transpileAcornFn} or {@link transpileBabelFn} instead.
 */
export function transpileFn(rootNode: JsNode): TranspilationResult {
  if (legacyParser === undefined) {
    legacyParser = createParser('legacy');
  }
  return legacyParser.transpileFn(rootNode, {});
}

/**
 * @deprecated Use {@link transpileAcornNode} or {@link transpileBabelNode} instead.
 */
export function transpileNode(rootNode: JsNode): tinyest.AnyNode {
  if (legacyParser === undefined) {
    legacyParser = createParser('legacy');
  }
  return legacyParser.transpileNode(rootNode, {});
}
