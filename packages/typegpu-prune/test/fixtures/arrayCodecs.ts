import { d } from 'typegpu';
import { precompile } from '@typegpu/prune';

export const arrays = precompile(() => ({ Weights: d.arrayOf(d.f16, 1000) }));
