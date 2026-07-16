import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import {
  bitcastF32toU32Impl,
  bitcastU32toF32Impl,
  bitcastU32toI32Impl,
} from '../data/numberOps.ts';
import { f16, f32, i32, u32 } from '../data/numeric.ts';
import { isVec } from '../data/wgslTypes.ts';
import {
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type {
  AnyNumericVecInstance,
  AnyWgslData,
  F16,
  F32,
  I32,
  U32,
  v2f,
  v2i,
  v2u,
  v3f,
  v3i,
  v3u,
  v4f,
  v4i,
  v4u,
} from '../data/wgslTypes.ts';
import { unifyStrict } from '../tgsl/conversion.ts';
import { SignatureNotSupportedError } from '../errors.ts';
import { comptime } from '../tgpu.ts';
import { getName } from '../internal.ts';
import type { Infer } from '../shared/repr.ts';

type BitcastU32toF32Overload = <T extends number | v2u | v3u | v4u>(
  value: T,
) => T extends v2u ? v2f : T extends v3u ? v3f : T extends v4u ? v4f : number;

const u32AllowedSchemas = [u32, vec2u, vec3u, vec4u];

// TODO(#2731): Remove deprecated bitcasts. Remember about cpu implementations.

/**
 * @deprecated Use 'std.bitcast' instead.
 */
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

/**
 * @deprecated Use 'std.bitcast' instead.
 */
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

/**
 * @deprecated Use 'std.bitcast' instead.
 */
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

const bitcastAllowedSchemas = [
  /* 2 bytes */
  f16,

  /* 4 bytes */
  f32,
  i32,
  u32,
  vec2h,

  /* 6 bytes */
  vec3h,

  /* 8 bytes */
  vec2f,
  vec2i,
  vec2u,
  vec4h,

  /* 12 bytes */
  vec3f,
  vec3i,
  vec3u,

  /* 16 bytes */
  vec4f,
  vec4i,
  vec4u,
] as const;

type BitcastAllowedTypes = (typeof bitcastAllowedSchemas)[number];

const buffer = new ArrayBuffer(16);
const bufViews = {
  f32: new Float32Array(buffer),
  u32: new Uint32Array(buffer),
  i32: new Int32Array(buffer),
  f16: new Float16Array(buffer),
};

function writeToBuffer(
  item: AnyNumericVecInstance | number,
  target: Float32Array | Uint32Array | Int32Array | Float16Array,
): void {
  if (typeof item === 'number') {
    target[0] = item;
  } else {
    for (let i = 0; i < item.length; i++) {
      target[i] = item[i] as number;
    }
  }
}

function readFromBuffer<Schema extends BitcastAllowedTypes>(
  buf: Float32Array | Uint32Array | Int32Array | Float16Array,
  schema: Schema,
): Infer<Schema> {
  const length = 'componentCount' in schema ? schema.componentCount : 1;
  const items = [];
  for (let i = 0; i < length; i++) {
    items.push(buf[i]);
  }
  return schema(...items) as Infer<Schema>;
}

const getCpuBitcast = <In extends BitcastAllowedTypes, Out extends BitcastAllowedTypes>(
  inType: In,
  outType: Out,
) => {
  const writeToPrimitive: F32 | U32 | I32 | F16 = 'primitive' in inType ? inType.primitive : inType;
  const readFromPrimitive: F32 | U32 | I32 | F16 =
    'primitive' in outType ? outType.primitive : outType;

  return (value: Infer<In>): Infer<Out> => {
    writeToBuffer(value, bufViews[writeToPrimitive.type]);
    return readFromBuffer(bufViews[readFromPrimitive.type], outType);
  };
};

const bitcastFor = <In extends BitcastAllowedTypes, Out extends BitcastAllowedTypes>(
  inType: In,
  outType: Out,
) => {
  return dualImpl({
    name: 'bitcast',
    normalImpl: getCpuBitcast<In, Out>(inType, outType),
    codegenImpl: (_ctx, [n]) => stitch`bitcast<${outType.type}>(${n})`,
    signature: (arg) => {
      const uarg = unifyStrict([arg], [inType]);
      if (!uarg) {
        throw new SignatureNotSupportedError([arg], [inType]);
      }
      return {
        argTypes: uarg,
        returnType: outType,
      };
    },
    sideEffects: false,
  });
};

const casts = {
  /* 2 bytes */
  f16: {
    f16: bitcastFor(f16, f16),
  },

  /* 4 bytes */
  f32: {
    f32: bitcastFor(f32, f32),
    i32: bitcastFor(f32, i32),
    u32: bitcastFor(f32, u32),
    vec2h: bitcastFor(f32, vec2h),
  },
  i32: {
    f32: bitcastFor(i32, f32),
    i32: bitcastFor(i32, i32),
    u32: bitcastFor(i32, u32),
    vec2h: bitcastFor(i32, vec2h),
  },
  u32: {
    f32: bitcastFor(u32, f32),
    i32: bitcastFor(u32, i32),
    u32: bitcastFor(u32, u32),
    vec2h: bitcastFor(u32, vec2h),
  },
  vec2h: {
    vec2h: bitcastFor(vec2h, vec2h),
    f32: bitcastFor(vec2h, f32),
    i32: bitcastFor(vec2h, i32),
    u32: bitcastFor(vec2h, u32),
  },

  /* 6 bytes */
  vec3h: {
    vec3h: bitcastFor(vec3h, vec3h),
  },

  /* 8 bytes */
  vec2f: {
    vec2f: bitcastFor(vec2f, vec2f),
    vec2i: bitcastFor(vec2f, vec2i),
    vec2u: bitcastFor(vec2f, vec2u),
    vec4h: bitcastFor(vec2f, vec2h),
  },
  vec2i: {
    vec2f: bitcastFor(vec2i, vec2f),
    vec2i: bitcastFor(vec2i, vec2i),
    vec2u: bitcastFor(vec2i, vec2u),
    vec4h: bitcastFor(vec2i, vec4h),
  },
  vec2u: {
    vec2f: bitcastFor(vec2u, vec2f),
    vec2i: bitcastFor(vec2u, vec2i),
    vec2u: bitcastFor(vec2u, vec2u),
    vec4h: bitcastFor(vec2u, vec4h),
  },
  vec4h: {
    vec2f: bitcastFor(vec4h, vec2f),
    vec2i: bitcastFor(vec4h, vec2i),
    vec2u: bitcastFor(vec4h, vec2u),
    vec4h: bitcastFor(vec4h, vec4h),
  },

  /* 12 bytes */
  vec3f: {
    vec3f: bitcastFor(vec3f, vec3f),
    vec3i: bitcastFor(vec3f, vec3i),
    vec3u: bitcastFor(vec3f, vec3u),
  },
  vec3i: {
    vec3f: bitcastFor(vec3i, vec3f),
    vec3i: bitcastFor(vec3i, vec3i),
    vec3u: bitcastFor(vec3i, vec3u),
  },
  vec3u: {
    vec3f: bitcastFor(vec3u, vec3f),
    vec3i: bitcastFor(vec3u, vec3i),
    vec3u: bitcastFor(vec3u, vec3u),
  },

  /* 16 bytes */
  vec4f: {
    vec4f: bitcastFor(vec4f, vec4f),
    vec4i: bitcastFor(vec4f, vec4i),
    vec4u: bitcastFor(vec4f, vec4u),
  },
  vec4i: {
    vec4f: bitcastFor(vec4i, vec4f),
    vec4i: bitcastFor(vec4i, vec4i),
    vec4u: bitcastFor(vec4i, vec4u),
  },
  vec4u: {
    vec4f: bitcastFor(vec4u, vec4f),
    vec4i: bitcastFor(vec4u, vec4i),
    vec4u: bitcastFor(vec4u, vec4u),
  },
} as const;

type SchemaFor<Type extends string> = Extract<AnyWgslData, { type: Type }>;

function getBitcast<
  FromType extends keyof typeof casts,
  ToType extends keyof (typeof casts)[FromType] & string,
>(from: SchemaFor<FromType>, to: SchemaFor<ToType>) {
  if ('type' in from && from.type in casts) {
    const intermediate = casts[from.type];
    if ('type' in to && to.type in intermediate) {
      return intermediate[to.type];
    }
  }
  throw new Error(`Incorrect bitcast from ${getName(from)} to ${getName(to)}.`);
}

export const bitcast = comptime(getBitcast);
