import { createDualImpl } from '../shared/generators.js';
import { Void } from '../types.js';

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
