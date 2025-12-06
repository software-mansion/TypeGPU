import { snip } from '../data/snippet.ts';
import { Void } from '../data/wgslTypes.ts';
import { createDualImpl } from '../core/function/dualImpl.ts';

export const discard = createDualImpl(
  // CPU
  (): never => {
    throw new Error(
      '`discard` relies on GPU resources and cannot be executed outside of a draw call',
    );
  },
  // GPU
  () => snip('discard;', Void, /* origin */ 'runtime'),
  'discard',
);
