import type { TranspilationResult } from './core/function/fnTypes';

/**
 * Used to transpile JS resources into SMoL on demand.
 */
export interface JitTranspiler {
  transpileFn(rawJs: string): TranspilationResult;
}
