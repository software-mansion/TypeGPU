import type * as smol from './smol';

/**
 * Used to transpile JS resources into SMoL on demand.
 */
export interface JitTranspiler {
  transpileFn(rawJs: string): { argNames: string[]; body: smol.Block };
}
