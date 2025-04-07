import { Void } from '../data/wgslTypes.js';
import { createDualImpl } from '../shared/generators.js';

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
