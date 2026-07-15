import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import {
  bitcastF32toU32Impl,
  bitcastU32toF32Impl,
  bitcastU32toI32Impl,
} from '../data/numberOps.ts';
import { bool, f16, f32, i32, u32 } from '../data/numeric.ts';
import { isVec } from '../data/wgslTypes.ts';
import {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../data/vector.ts';
import { VectorOps } from '../data/vectorOps.ts';
import type {
  AnyNumericVecInstance,
  AnyVecInstance,
  AnyWgslData,
  BaseData,
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
import { sizeOf } from '../data/sizeOf.ts';

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

const validBitcastNTypes = [f32, f16, i32, u32] as const;

const validBitcastVTypes = [
  vec2f,
  vec3f,
  vec4f,
  vec2h,
  vec3h,
  vec4h,
  vec2i,
  vec3i,
  vec4i,
  vec2u,
  vec3u,
  vec4u,
] as const;

const validBitcastTypes = [...validBitcastNTypes, ...validBitcastVTypes] as const;

type BitcastIOType = (typeof validBitcastTypes)[number];

const buf = new ArrayBuffer(16);
const bufViews = {
  f32: new Float32Array(buf),
  u32: new Uint32Array(buf),
  i32: new Int32Array(buf),
  f16: new Float16Array(buf),
};

function writeToBuf(
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

function readFromBuf<Schema extends BitcastIOType>(
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

const cpuBitcast = (
  inType: WgslTypeFor<keyof typeof bufViews>,
  outType: (typeof validBitcastNTypes)[number],
) => {
  const writeToPrimitive = 'primitive' in inType ? inType.primitive : inType;
  const readFromPrimitive = 'primitive' in outType ? outType.primitive : outType;

  return (n: number | AnyNumericVecInstance) => {
    writeToBuf(n, bufViews[writeToPrimitive.type]);
    return readFromBuf(bufViews[readFromPrimitive.type], outType);
  };
};

const bitcastFor = <In extends BitcastIOType, Out extends BitcastIOType>(
  inType: In,
  outType: Out,
) => {
  return dualImpl({
    name: 'bitcast',
    normalImpl: cpuBitcast(inType, outType) as unknown as (value: Infer<In>) => Infer<Out>, // TODO: type the function properly
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

// TODO: lepiej podzielić to na klasy abstrakcji
// i typować na chama
// ... i cacheować dual imple??
const casts = {
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

  f16: {
    f16: bitcastFor(f16, f16),
  },
  vec2h: {
    vec2h: bitcastFor(vec2h, vec2h),
    f32: bitcastFor(vec2h, f32),
    i32: bitcastFor(vec2h, i32),
    u32: bitcastFor(vec2h, u32),
  },
  vec3h: {
    vec3h: bitcastFor(vec3h, vec3h),
  },
  vec4h: {
    vec4h: bitcastFor(vec4h, vec4h),
    vec2f: bitcastFor(vec4h, vec2f),
    vec2i: bitcastFor(vec4h, vec2i),
    vec2u: bitcastFor(vec4h, vec2u),
  },
} as const;

type WgslTypeFor<Type extends string> = Extract<AnyWgslData, { type: Type }>;

function getBitcast<
  FromType extends keyof typeof casts,
  ToType extends keyof (typeof casts)[FromType] & string,
>(from: WgslTypeFor<FromType>, to: WgslTypeFor<ToType>) {
  if ('type' in from && from.type in casts) {
    const intermediate = casts[from.type];
    if ('type' in to && to.type in intermediate) {
      return intermediate[to.type];
    }
  }
  throw new Error(`Incorrect bitcast from ${getName(from)} to ${getName(to)}.`);
}

export const bitcast = comptime(getBitcast);

// T <=> T (liczby, wektory)
// T <=> S (f32, i32, u32)
// T <=> S (vecf ...)
// vec2h <=> u32/i32/f32
// vec4h <=> v2f/v2u/v2h
