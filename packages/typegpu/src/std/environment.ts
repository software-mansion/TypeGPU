import { bool } from '../data/numeric.ts';
import { snip } from '../data/snippet.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import type { DualFn } from '../types.ts';

const impl = (() => false) as DualFn<() => boolean>;
impl.toString = () => 'isBeingTraspiled';
impl[$gpuCallable] = {
  call(_ctx, _args) {
    return snip(true, bool, 'constant');
  },
};

/**
 * Returns `true` when the direct callee is being transpiled for GPU, otherwise `false`.
 *
 * @example
 * const f = () => {
 *   'use gpu';
 *   return isBeingTraspiled() ? 1 : 0;
 * };
 *
 * f() // returns 0, but resolved WGSL looks like this:
 *
 * fn f() -> i32 {
 *   return 1;
 * }
 *
 *
 * @note
 * Inside `comptime`, `lazy` or `simulate`, this always returns `false`.
 */
export const isBeingTraspiled = impl;

// getTargetShaderLanguage -> string | undefined;
// export const isBeingTraspiled = comptime(() => {
//   const ctx = getResolutionCtx();
//   if (ctx === undefined) {
//     return false;
//   }
//   return getExecMode().type !== 'simulate';
// });
