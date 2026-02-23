import * as TSL from 'three/tsl';
import tgpu, { d } from 'typegpu';
import { fromTSL } from './typegpu-node.ts';

export const uv = tgpu.comptime((index?: number) =>
  fromTSL(TSL.uv(index), d.vec2f)
);

export const time = fromTSL(TSL.time, d.f32);

export const instanceIndex = fromTSL(TSL.instanceIndex, d.u32);

export const vertexIndex = fromTSL(TSL.vertexIndex, d.u32);
