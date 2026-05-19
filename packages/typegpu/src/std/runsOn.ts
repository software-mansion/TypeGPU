import { bool } from '../data/numeric.ts';
import { snip } from '../data/snippet.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import type { DualFn } from '../types.ts';

export type Runtime = 'cpu' | 'gpu';

const impl = ((runtime: Runtime): boolean => runtime === 'cpu') as DualFn<
  (runtime: Runtime) => boolean
>;
impl.toString = () => 'runsOn';
impl[$gpuCallable] = {
  call(_ctx, args) {
    return snip((args[0].value as Runtime) === 'gpu', bool, 'constant');
  },
};

export const runsOn = impl;
