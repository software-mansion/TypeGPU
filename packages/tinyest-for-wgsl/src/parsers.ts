import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import type { Context, JsNode, TranspilationResult, Transpile, Transpilers } from './types.ts';
import { tryFindExternalChain } from './externals.ts';
import { acornTranspilers, babelTranspilers } from './transpilers.ts';
import { extractFunctionParts } from './functionParts.ts';

const { NodeTypeCatalog: NODE } = tinyest;

function createContext(params: tinyest.FuncParameter[]): Context {
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

        return transpile(ctx, prop) as tinyest.ObjectProperty;
      });

      if (objectProperties.some((prop) => /* computed */ prop[3])) {
        return [
          NODE.objectExprWithComputedProps,
          objectProperties,
        ] as tinyest.ObjectExpressionWithComputedProps;
      }

      const obj: Record<string, tinyest.Expression> = {};
      const seenKeys = new Set<string>();

      for (const prop of objectProperties) {
        const key = prop[1] as string;
        if (seenKeys.has(key)) {
          throw new Error(`Duplicate object property key: '${key}'.`);
        }
        seenKeys.add(key);
        obj[key] = /* value */ prop[2];
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

    if (ctx.ignoreExternalDepth === 0) {
      // Check if the node is an external prop access chain, and if so,
      // add it to externals and swap the AST node for an identifier.
      const externalChain = tryFindExternalChain(ctx, node);
      if (externalChain) {
        ctx.externalNames.set(externalChain, externalChain);
        return externalChain;
      }
    }

    // @ts-ignore <too much for typescript, it seems :/ >
    return transpiler(ctx, node, transpile);
  };

  return {
    transpileFn(rootNode: JsNode): TranspilationResult {
      const { params, body } = extractFunctionParts(rootNode);
      const ctx = createContext(params);

      const tinyestBody = transpile(ctx, body);

      if (body.type === 'BlockStatement') {
        return {
          params,
          body: tinyestBody as tinyest.Block,
          externalNames: ctx.externalNames,
        };
      }

      return {
        params,
        body: [NODE.block, [[NODE.return, tinyestBody as tinyest.Expression]]],
        externalNames: ctx.externalNames,
      };
    },

    transpileNode(node: JsNode): tinyest.AnyNode {
      return transpile(createContext([]), node);
    },
  };
}

const parsers = {
  acorn: createParser('acorn'),
  babel: createParser('babel'),
};

let legacyParser: ReturnType<typeof createParser> | undefined = undefined;

export function transpileFnAcorn(rootNode: acorn.AnyNode): TranspilationResult {
  return parsers.acorn.transpileFn(rootNode);
}

export function transpileNodeAcorn(rootNode: acorn.AnyNode): tinyest.AnyNode {
  return parsers.acorn.transpileNode(rootNode);
}

export function transpileFnBabel(rootNode: babel.Node): TranspilationResult {
  return parsers.babel.transpileFn(rootNode);
}

export function transpileNodeBabel(rootNode: babel.Node): tinyest.AnyNode {
  return parsers.babel.transpileNode(rootNode);
}

/**
 * @deprecated Use {@link transpileFnAcorn} or {@link transpileFnBabel} instead.
 */
export function transpileFn(rootNode: JsNode): TranspilationResult {
  if (legacyParser === undefined) {
    legacyParser = createParser('legacy');
  }
  return legacyParser.transpileFn(rootNode);
}

/**
 * @deprecated Use {@link transpileNodeAcorn} or {@link transpileNodeBabel} instead.
 */
export function transpileNode(rootNode: JsNode): tinyest.AnyNode {
  if (legacyParser === undefined) {
    legacyParser = createParser('legacy');
  }
  return legacyParser.transpileNode(rootNode);
}
