import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { bitcastU32toF32Impl, bitcastU32toI32Impl } from '../data/numberOps.ts';
import { f32, i32, u32 } from '../data/numeric.ts';
import { isVec } from '../data/wgslTypes.ts';
import { vec2f, vec2i, vec3f, vec3i, vec4f, vec4i } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type { v2f, v2i, v2u, v3f, v3i, v3u, v4f, v4i, v4u } from '../data/wgslTypes.ts';
import { unify } from '../tgsl/conversion.ts';

export type BitcastU32toF32Overload = ((value: number) => number) &
  ((value: v2u) => v2f) &
  ((value: v3u) => v3f) &
  ((value: v4u) => v4f);

export const bitcastU32toF32 = dualImpl({
  name: 'bitcastU32toF32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastU32toF32Impl(value);
    }
    return VectorOps.bitcastU32toF32[value.kind](value);
  }) as BitcastU32toF32Overload,
  codegenImpl: (_ctx, [n]) => stitch`bitcast<f32>(${n})`,
  signature: (...arg) => {
    const uargs = unify(arg, [u32]) ?? arg;
    return {
      argTypes: uargs,
      returnType: isVec(uargs[0])
        ? uargs[0].type === 'vec2u'
          ? vec2f
          : uargs[0].type === 'vec3u'
            ? vec3f
            : vec4f
        : f32,
    };
  },
});

export type BitcastU32toI32Overload = ((value: number) => number) &
  ((value: v2u) => v2i) &
  ((value: v3u) => v3i) &
  ((value: v4u) => v4i);

export const bitcastU32toI32 = dualImpl({
  name: 'bitcastU32toI32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastU32toI32Impl(value);
    }
    return VectorOps.bitcastU32toI32[value.kind](value);
  }) as BitcastU32toI32Overload,
  codegenImpl: (_ctx, [n]) => stitch`bitcast<i32>(${n})`,
  signature: (...arg) => {
    const uargs = unify(arg, [u32]) ?? arg;
    return {
      argTypes: uargs,
      returnType: isVec(uargs[0])
        ? uargs[0].type === 'vec2u'
          ? vec2i
          : uargs[0].type === 'vec3u'
            ? vec3i
            : vec4i
        : i32,
    };
  },
});
