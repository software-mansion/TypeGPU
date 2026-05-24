import { comptime } from '../core/function/comptime.ts';
import { getExecMode, getResolutionCtx } from '../execMode.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { coerceToSnippet } from '../tgsl/generationHelpers.ts';
import type { DualFn } from '../types.ts';

const impl = (() => false) as DualFn<() => boolean>;
impl.toString = () => 'isBeingTranspiled';
impl[$gpuCallable] = {
  call(_ctx, _args) {
    return coerceToSnippet(true);
  },
};

/**
 * Returns `true` when the direct callee is being transpiled for GPU, otherwise `false`.
 *
 * @example
 * const f = () => {
 *   'use gpu';
 *   return isBeingTranspiled() ? 1 : 0;
 * };
 *
 * f(); // returns 0, but resolved WGSL looks like this:
 *
 * fn f() -> i32 {
 *   return 1;
 * }
 *
 * @note
 * Inside `comptime`, `lazy` or `simulate`, it always returns `false`.
 */
export const isBeingTranspiled = impl;

/**
 * Returns `wgsl` if invoked during the resolution process; otherwise, returns `undefined`.
 *
 * @example
 * const f = () => {
 *   'use gpu';
 *   return getTargetShaderLanguage() === 'wgsl';
 * };
 *
 * f(); // returns false, but resolved WGSL looks like this:
 *
 * fn f() -> bool {
 *   return true;
 * }
 *
 * @note
 * Inside `lazy`, it always returns `wgsl`.
 * Inside `simulate`, it always returns `undefined`.
 * Inside `comptime`, it returns `wgsl` if called during the resolution process; otherwise, `undefined`.
 */
export const getTargetShaderLanguage = comptime((() => {
  const ctx = getResolutionCtx();
  if (!ctx) {
    return undefined;
  }
  return getExecMode().type !== 'simulate' ? 'wgsl' : undefined;
}) as () => string | undefined);
