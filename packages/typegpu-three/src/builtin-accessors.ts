import * as d from 'typegpu/data';
import * as TSL from 'three/tsl';
import { fromTSL } from './typegpu-node.ts';

// export const uv = (index?: number | undefined) => {
//   return fromTSL(TSL.uv(index), { type: d.vec2f });
// };
export const uv = fromTSL(TSL.uv(), { type: d.vec2f });

export const time = fromTSL(TSL.time, { type: d.vec2f });
