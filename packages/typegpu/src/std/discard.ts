import { Void } from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';

export const discard = createDualImpl(
  // CPU
  (): never => {
    throw new Error('discard() can only be used on the GPU.');
  },
  // GPU
  () => ({
    value: 'discard;',
    dataType: Void,
  }),
);
