import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import * as tinyest from 'tinyest';

export type Scope = {
  /** identifiers declared in this scope */
  declaredNames: string[];
};

export interface Externals {
  [key: string]: Externals | string;
}

export type Context = {
  /** Holds a set of all identifiers that were used in code, but were not declared in code. */
  externalNames: Externals;
  /** Used to signal to identifiers that they should not treat their resolution as possible external uses. */
  ignoreExternalDepth: number;
  stack: Scope[];
  ancestorChain: JsNode[];
};

export type TranspilationResult = {
  params: tinyest.FuncParameter[];
  body: tinyest.Block;
  /**
   * All identifiers found in the function code that are not declared in the
   * function itself, or in the block that is accessing that identifier.
   */
  externalNames: Externals;
};

export type JsNode = babel.Node | acorn.AnyNode;
