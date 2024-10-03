import { builtin } from './builtin';
import {
  type F32,
  type TgpuArray,
  type U32,
  type Vec3u,
  type Vec4f,
  arrayOf,
  f32,
  u32,
  vec3u,
  vec4f,
} from './data';

export type BuiltInPossibleTypes = U32 | F32 | Vec3u | Vec4f | TgpuArray<U32>;

const builtinToType: Record<symbol, BuiltInPossibleTypes> = {
  [builtin.vertexIndex.s]: u32,
  [builtin.instanceIndex.s]: u32,
  [builtin.position.s]: vec4f,
  [builtin.clipDistances.s]: arrayOf(u32, 8),
  [builtin.frontFacing.s]: f32,
  [builtin.fragDepth.s]: f32,
  [builtin.sampleIndex.s]: u32,
  [builtin.sampleMask.s]: u32,
  [builtin.fragment.s]: vec4f,
  [builtin.localInvocationId.s]: vec3u,
  [builtin.localInvocationIndex.s]: u32,
  [builtin.globalInvocationId.s]: vec3u,
  [builtin.workgroupId.s]: vec3u,
  [builtin.numWorkgroups.s]: vec3u,
};

export function typeForBuiltin(key: symbol): BuiltInPossibleTypes {
  const dataType = builtinToType[key];
  if (!dataType) {
    throw new Error(`The symbol ${String(key)} in not a valid 'builtin'`);
  }

  return dataType;
}
