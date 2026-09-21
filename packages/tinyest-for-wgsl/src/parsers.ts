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

function createParser(kind: 'acorn' | 'babel') {
  const transpilers = (
    kind === 'acorn' ? acornTranspilers : babelTranspilers
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

export function transpileAcornFn(rootNode: acorn.AnyNode): TranspilationResult {
  return parsers.acorn.transpileFn(rootNode);
}

export function transpileAcornNode(rootNode: acorn.AnyNode): tinyest.AnyNode {
  return parsers.acorn.transpileNode(rootNode);
}

export function transpileBabelFn(rootNode: babel.Node): TranspilationResult {
  return parsers.babel.transpileFn(rootNode);
}

export function transpileBabelNode(rootNode: babel.Node): tinyest.AnyNode {
  return parsers.babel.transpileNode(rootNode);
}
