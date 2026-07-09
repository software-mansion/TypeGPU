import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import {
  bitcastF32toU32Impl,
  bitcastU32toF32Impl,
  bitcastU32toI32Impl,
} from '../data/numberOps.ts';
import { f32, i32, u32 } from '../data/numeric.ts';
import { isVec } from '../data/wgslTypes.ts';
import { vec2f, vec2i, vec2u, vec3f, vec3i, vec3u, vec4f, vec4i, vec4u } from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type { v2f, v2i, v2u, v3f, v3i, v3u, v4f, v4i, v4u } from '../data/wgslTypes.ts';
import { unifyStrict } from '../tgsl/conversion.ts';
import { SignatureNotSupportedError } from '../errors.ts';

type BitcastU32toF32Overload = <T extends number | v2u | v3u | v4u>(
  value: T,
) => T extends v2u ? v2f : T extends v3u ? v3f : T extends v4u ? v4f : number;

const u32AllowedSchemas = [u32, vec2u, vec3u, vec4u];

export const bitcastU32toF32 = dualImpl({
  name: 'bitcastU32toF32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastU32toF32Impl(value);
    }
    return VectorOps.bitcastU32toF32[value.kind](value);
  }) as BitcastU32toF32Overload,
  codegenImpl: (_ctx, [n]) => {
    return isVec(n.dataType)
      ? stitch`bitcast<vec${n.dataType.componentCount}f>(${n})`
      : stitch`bitcast<f32>(${n})`;
  },
  signature: (...arg) => {
    const uargs = unifyStrict(arg, u32AllowedSchemas);
    if (!uargs) {
      throw new SignatureNotSupportedError(arg, u32AllowedSchemas);
    }
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
  sideEffects: false,
});

type BitcastU32toI32Overload = <T extends number | v2u | v3u | v4u>(
  value: T,
) => T extends v2u ? v2i : T extends v3u ? v3i : T extends v4u ? v4i : number;

export const bitcastU32toI32 = dualImpl({
  name: 'bitcastU32toI32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastU32toI32Impl(value);
    }
    return VectorOps.bitcastU32toI32[value.kind](value);
  }) as BitcastU32toI32Overload,
  codegenImpl: (_ctx, [n]) => {
    return isVec(n.dataType)
      ? stitch`bitcast<vec${n.dataType.componentCount}i>(${n})`
      : stitch`bitcast<i32>(${n})`;
  },
  signature: (...arg) => {
    const uargs = unifyStrict(arg, u32AllowedSchemas);
    if (!uargs) {
      throw new SignatureNotSupportedError(arg, u32AllowedSchemas);
    }
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
  sideEffects: false,
});

type BitcastF32toU32Overload = <T extends number | v2f | v3f | v4f>(
  value: T,
) => T extends v2f ? v2u : T extends v3f ? v3u : T extends v4f ? v4u : number;

const f32AllowedSchemas = [f32, vec2f, vec3f, vec4f];

export const bitcastF32toU32 = dualImpl({
  name: 'bitcastF32toU32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastF32toU32Impl(value);
    }
    return VectorOps.bitcastF32toU32[value.kind](value);
  }) as BitcastF32toU32Overload,
  codegenImpl: (_ctx, [n]) => {
    return isVec(n.dataType)
      ? stitch`bitcast<vec${n.dataType.componentCount}u>(${n})`
      : stitch`bitcast<u32>(${n})`;
  },
  signature: (...arg) => {
    const uargs = unifyStrict(arg, f32AllowedSchemas);
    if (!uargs) {
      throw new SignatureNotSupportedError(arg, f32AllowedSchemas);
    }
    return {
      argTypes: uargs,
      returnType: isVec(uargs[0])
        ? uargs[0].type === 'vec2f'
          ? vec2u
          : uargs[0].type === 'vec3f'
            ? vec3u
            : vec4u
        : u32,
    };
  },
  sideEffects: false,
});

export type BitcastF32toU32Overload = ((value: number) => number) &
  ((value: v2f) => v2u) &
  ((value: v3f) => v3u) &
  ((value: v4f) => v4u);

export const bitcastF32toU32 = dualImpl({
  name: 'bitcastF32toU32',
  normalImpl: ((value) => {
    if (typeof value === 'number') {
      return bitcastF32toU32Impl(value);
    }
    return VectorOps.bitcastF32toU32[value.kind](value);
  }) as BitcastF32toU32Overload,
  codegenImpl: (_ctx, [n]) => {
    return isVec(n.dataType)
      ? stitch`bitcast<vec${n.dataType.componentCount}u>(${n})`
      : stitch`bitcast<u32>(${n})`;
  },
  signature: (...arg) => {
    const uargs = unify(arg, [f32]) ?? arg;
    return {
      argTypes: uargs,
      returnType: isVec(uargs[0])
        ? uargs[0].type === 'vec2f'
          ? vec2u
          : uargs[0].type === 'vec3f'
            ? vec3u
            : vec4u
        : u32,
    };
  },
});
