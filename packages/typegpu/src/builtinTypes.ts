import * as TB from 'typed-binary';
import {
  type F32,
  SimpleWgslData,
  type U32,
  type Vec3u,
  type Vec4f,
  f32,
  u32,
  vec3u,
  vec4f,
} from './data';
import type { WgslData } from './types';
import { builtin } from './wgslBuiltin';

export type BuiltInPossibleTypes =
  | U32
  | F32
  | Vec3u
  | Vec4f
  | WgslData<TB.Unwrap<U32>[]>;

export const builtinToType: Record<symbol, BuiltInPossibleTypes> = {
  [builtin.vertexIndex]: u32,
  [builtin.instanceIndex]: u32,
  [builtin.position]: vec4f,
  [builtin.clipDistances]: new SimpleWgslData({
    schema: TB.arrayOf(u32, 8),
    byteAlignment: 16,
    code: 'array<u32, 8>',
  }),
  [builtin.frontFacing]: f32,
  [builtin.fragDepth]: f32,
  [builtin.sampleIndex]: u32,
  [builtin.sampleMask]: u32,
  [builtin.fragment]: vec4f,
  [builtin.localInvocationId]: vec3u,
  [builtin.localInvocationIndex]: u32,
  [builtin.globalInvocationId]: vec3u,
  [builtin.workgroupId]: vec3u,
  [builtin.numWorkgroups]: vec3u,
};
