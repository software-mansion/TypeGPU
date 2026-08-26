import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';
import type {
  AstKind,
  Context,
  JsNode,
  TranspilationOptions,
  TranspilationResult,
  Transpile,
  Transpilers,
} from './types.ts';
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

function createParser(ast: AstKind) {
  const transpilers = (
    ast === 'acorn' ? acornTranspilers : babelTranspilers
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

export function transpileFn(
  rootNode: acorn.AnyNode,
  options: TranspilationOptions<'acorn'>,
): TranspilationResult;
export function transpileFn(
  rootNode: babel.Node,
  options: TranspilationOptions<'babel'>,
): TranspilationResult;
export function transpileFn(rootNode: JsNode, { ast }: TranspilationOptions): TranspilationResult {
  return parsers[ast].transpileFn(rootNode);
}

export function transpileNode(
  rootNode: acorn.AnyNode,
  options: TranspilationOptions<'acorn'>,
): tinyest.AnyNode;
export function transpileNode(
  rootNode: babel.Node,
  options: TranspilationOptions<'babel'>,
): tinyest.AnyNode;
export function transpileNode(rootNode: JsNode, { ast }: TranspilationOptions): tinyest.AnyNode {
  return parsers[ast].transpileNode(rootNode);
}
