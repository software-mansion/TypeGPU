import { comptime } from '../core/function/comptime.ts';
import { getExecMode, getResolutionCtx } from '../execMode.ts';

// getTargetShaderLanguage -> string | undefined
// export type Runtime = 'cpu' | 'gpu';
// const impl = ((runtime: Runtime): boolean => runtime === 'cpu') as DualFn<
//   (runtime: Runtime) => boolean
// >;
// impl.toString = () => 'runsOn';
// impl[$gpuCallable] = {
//   call(_ctx, args) {
//     return snip((args[0].value as Runtime) === 'gpu', bool, 'constant');
//   },
// };

// export const runsOn = impl;

export const isBeingTraspiled = comptime(() => {
  const ctx = getResolutionCtx();
  if (ctx === undefined) {
    return false;
  }
  return getExecMode().type !== 'simulate';
});
