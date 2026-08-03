import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';

export type Scope = {
  /** identifiers declared in this scope */
  declaredNames: string[];
};

export type Externals = Set<string>;

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
