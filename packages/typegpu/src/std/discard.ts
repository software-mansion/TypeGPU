import { snip } from '../data/dataTypes.ts';
import { Void } from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';

export const discard = createDualImpl(
  // CPU
  (): never => {
    throw new Error('`discard` relies on GPU resources and cannot be executed outside of a compute dispatch or draw call');
  },
  // GPU
  () => snip('discard;', Void),
  'discard',
);
