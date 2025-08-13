import { bool, f16, f32, i32, u32 } from '../data/numeric.ts';
import {
  isNumericSchema,
  isVec,
  isWgslArray,
  isWgslStruct,
} from '../data/wgslTypes.ts';
import {
  type AnyData,
  isDisarray,
  isUnstruct,
  UnknownData,
} from '../data/dataTypes.ts';
import * as vec from '../data/vector.ts';

type SwizzleableType = 'f' | 'h' | 'i' | 'u' | 'b';
type SwizzleLength = 1 | 2 | 3 | 4;

const swizzleLenToType: Record<
  SwizzleableType,
  Record<SwizzleLength, AnyData>
> = {
  f: {
    1: f32,
    2: vec.vec2f,
    3: vec.vec3f,
    4: vec.vec4f,
  },
  h: {
    1: f16,
    2: vec.vec2h,
    3: vec.vec3h,
    4: vec.vec4h,
  },
  i: {
    1: i32,
    2: vec.vec2i,
    3: vec.vec3i,
    4: vec.vec4i,
  },
  u: {
    1: u32,
    2: vec.vec2u,
    3: vec.vec3u,
    4: vec.vec4u,
  },
  b: {
    1: bool,
    2: vec.vec2b,
    3: vec.vec3b,
    4: vec.vec4b,
  },
} as const;

const indexableTypeToResult = {
  vec2f: f32,
  vec2h: f16,
  vec2i: i32,
  vec2u: u32,
  'vec2<bool>': bool,
  vec3f: f32,
  vec3h: f16,
  vec3i: i32,
  vec3u: u32,
  'vec3<bool>': bool,
  vec4f: f32,
  vec4h: f16,
  vec4i: i32,
  vec4u: u32,
  'vec4<bool>': bool,
  mat2x2f: vec.vec2f,
  mat3x3f: vec.vec3f,
  mat4x4f: vec.vec4f,
} as const;

export function getTypeForPropAccess(
  targetType: AnyData,
  propName: string,
): AnyData | UnknownData {
  if (isWgslStruct(targetType) || isUnstruct(targetType)) {
    return targetType.propTypes[propName] as AnyData ?? UnknownData;
  }

  if (targetType === bool || isNumericSchema(targetType)) {
    // No props to be accessed here
    return UnknownData;
  }

  const propLength = propName.length;
  if (
    isVec(targetType) &&
    propLength >= 1 &&
    propLength <= 4
  ) {
    const swizzleTypeChar = targetType.type.includes('bool')
      ? 'b'
      : (targetType.type[4] as SwizzleableType);
    const swizzleType =
      swizzleLenToType[swizzleTypeChar][propLength as SwizzleLength];
    if (swizzleType) {
      return swizzleType;
    }
  }

  return UnknownData;
}

export function getTypeForIndexAccess(
  dataType: AnyData,
): AnyData | UnknownData {
  // array
  if (isWgslArray(dataType) || isDisarray(dataType)) {
    return dataType.elementType as AnyData;
  }

  // vector or matrix
  if (dataType.type in indexableTypeToResult) {
    return indexableTypeToResult[
      dataType.type as keyof typeof indexableTypeToResult
    ];
  }

  return UnknownData;
}
