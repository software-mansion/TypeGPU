import { snip } from '../data/dataTypes.ts';
import { Void } from '../data/wgslTypes.ts';
import { createDualImpl } from '../shared/generators.ts';
import { setName } from '../shared/meta.ts';

export const discard = createDualImpl(
  // CPU
  (): never => {
    throw new Error('discard() can only be used on the GPU.');
  },
  // GPU
  () => snip('discard;', Void),
);
setName(discard, 'discard');
