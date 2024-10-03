import type * as smol from './smol';

/**
 * Used to transpile JS resources into SMoL on demand.
 */
export interface JitTranspiler {
  transpileFn(rawJs: string): {
    argNames: string[];
    body: smol.Block;
    /**
     * All identifiers found in the function code that are not declared in the
     * function itself, or in the block that is accessing that identifier.
     */
    externalNames: string[];
  };
}
