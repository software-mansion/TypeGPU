import type { TranspilationResult } from './core/function/fnTypes.ts';

/**
 * Used to transpile JS resources into SMoL on demand.
 */
export interface JitTranspiler {
  transpileFn(rawJs: string): TranspilationResult;
}
