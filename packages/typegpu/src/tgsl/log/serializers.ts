import { fn } from '../../core/function/tgpuFn.ts';
import { arrayOf } from '../../data/array.ts';
import { u32 } from '../../data/numeric.ts';
import { vec3u } from '../../data/vector.ts';

const serializeU32 = fn([u32], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(n);
}`;

const serializeVec3u = fn([vec3u], arrayOf(u32, 3))`(v) => {
  return array<u32, 3>(v.x, v.y, v.z);
}`;

const deserializeU32 = (data: number[]) => data[0] ?? 0;

const deserializeVec3u = (
  data: number[],
) => [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0];

export const serializers = {
  u32: serializeU32,
  vec3u: serializeVec3u,
} as const;

export const deserializers = {
  u32: deserializeU32,
  vec3u: deserializeVec3u,
} as const;
