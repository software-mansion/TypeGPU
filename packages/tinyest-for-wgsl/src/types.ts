import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import type { AnyNode } from 'tinyest';
import * as tinyest from 'tinyest';

export type Scope = {
  /** identifiers declared in this scope */
  declaredNames: string[];
};

export type Externals = Map<string, string>;
export type MappableNode = Extract<AnyNode, readonly unknown[]>;
export type SourceMapEntry = [startLine: number, startColumn: number] | undefined;

export type Context = {
  /** Holds a set of all identifiers that were used in code, but were not declared in code. */
  externalNames: Externals;
  /** Used to signal to identifiers that they should not treat their resolution as possible external uses. */
  ignoreExternalDepth: number;
  /**
   * Keeps the set of nodes visited by `tryFindExternalChain`.
   * This helps optimize code like `ext().x.y.z.t`:
   * instead of traversing chains `.x.y.z.t`, `.x.y.z`, `.x.y` and `.x`,
   * we only traverse the first one and then return early.
   */
  visitedNodes: Set<babel.MemberExpression | acorn.MemberExpression>;
  stack: Scope[];
  /**
   * Node data is collected and saved based on the opts.sourceMap.
   */
  nodeSourceMap: WeakMap<MappableNode, SourceMapEntry>;
  opts: TranspilationOptions;
};

export type TranspilationResult = {
  params: tinyest.FuncParameter[];
  body: tinyest.Block;
  /**
   * All identifiers found in the function code that are not declared in the function itself.
   * Included identifiers are already flattened, so this array may contain identifiers like `EXT.vec.x`.
   */
  externalNames: Externals;
};

export type JsNode = babel.Node | acorn.AnyNode;

export type Transpile<TNode extends JsNode> = (ctx: Context, node: TNode) => tinyest.AnyNode;

export type Transpilers<TNode extends JsNode> = Partial<{
  [Type in TNode['type']]: (
    ctx: Context,
    node: Extract<TNode, { type: Type }>,
    transpile: Transpile<TNode>,
  ) => tinyest.AnyNode;
}>;

export type AstKind = 'acorn' | 'babel';

export type TranspilationOptions<TAst extends AstKind = AstKind> = {
  ast: TAst;
  /**
   * With this option enabled, identifiers and boolean literals will be wrapped
   * in dedicated nodes, instead of being transpiled as string/boolean.
   *
   * @default false
   */
  verboseNodes?: boolean;
  /**
   * Function used for determining node's SourceMapEntry.
   */
  sourceMap?: (node: JsNode) => SourceMapEntry;
};
