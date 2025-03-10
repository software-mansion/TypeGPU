import { isDerived, isSlot } from '../core/slot/slotTypes';
import {
  abstractFloat,
  abstractInt,
  bool,
  f16,
  f32,
  i32,
  u32,
} from '../data/numeric';
import type { WgslStruct } from '../data/struct';
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
} from '../data/vector';
import {
  type AnyWgslData,
  type BaseData,
  isDecorated,
  isWgslArray,
  isWgslData,
} from '../data/wgslTypes';
import { getResolutionCtx } from '../gpuMode';
import { $internal } from '../shared/symbols';
import {
  type Resource,
  UnknownData,
  type Wgsl,
  hasInternalDataType,
  isBufferUsage,
} from '../types';

const swizzleableTypes = [
  'vec2f',
  'vec2h',
  'vec2i',
  'vec2u',
  'vec3f',
  'vec3h',
  'vec3i',
  'vec3u',
  'vec4f',
  'vec4h',
  'vec4i',
  'vec4u',
  'struct',
] as const;

type SwizzleableType = 'f' | 'h' | 'i' | 'u';
type SwizzleLength = 1 | 2 | 3 | 4;

const swizzleLenToType: Record<
  SwizzleableType,
  Record<SwizzleLength, AnyWgslData>
> = {
  f: {
    1: f32,
    2: vec2f,
    3: vec3f,
    4: vec4f,
  },
  h: {
    1: f16,
    2: vec2h,
    3: vec3h,
    4: vec4h,
  },
  i: {
    1: i32,
    2: vec2i,
    3: vec3i,
    4: vec4i,
  },
  u: {
    1: u32,
    2: vec2u,
    3: vec3u,
    4: vec4u,
  },
} as const;

const indexableTypeToResult = {
  vec2f: f32,
  vec2h: f16,
  vec2i: i32,
  vec2u: u32,
  vec3f: f32,
  vec3h: f16,
  vec3i: i32,
  vec3u: u32,
  vec4f: f32,
  vec4h: f16,
  vec4i: i32,
  vec4u: u32,
  mat2x2f: vec2f,
  mat3x3f: vec3f,
  mat4x4f: vec4f,
} as const;

export function getTypeForPropAccess(
  targetType: Wgsl,
  propName: string,
): BaseData | undefined {
  if (
    typeof targetType === 'string' ||
    typeof targetType === 'number' ||
    typeof targetType === 'boolean'
  ) {
    return undefined;
  }

  if (isDerived(targetType) || isSlot(targetType)) {
    const ctx = getResolutionCtx();
    if (!ctx) {
      throw new Error(
        'Resolution context not found when unwrapping slot or derived',
      );
    }
    return ctx.unwrap(targetType) as BaseData;
  }

  let target = targetType as BaseData;

  if (isBufferUsage(target)) {
    target = target[$internal].dataType as BaseData;
  }
  if (hasInternalDataType(target)) {
    target = target[$internal].dataType;
  }
  while (isDecorated(target)) {
    target = target.inner;
  }

  const targetTypeStr =
    'kind' in target ? (target.kind as string) : target.type;

  if (targetTypeStr === 'struct') {
    return (target as WgslStruct).propTypes[propName];
  }

  const propLength = propName.length;
  if (
    swizzleableTypes.includes(
      targetTypeStr as (typeof swizzleableTypes)[number],
    ) &&
    propLength >= 1 &&
    propLength <= 4
  ) {
    const swizzleTypeChar = targetTypeStr[4] as SwizzleableType;
    const swizzleType =
      swizzleLenToType[swizzleTypeChar][propLength as SwizzleLength];
    if (swizzleType) {
      return swizzleType;
    }
  }

  return isWgslData(target) ? target : undefined;
}

export function getTypeForIndexAccess(resource: Wgsl): BaseData | undefined {
  if (typeof resource === 'string' || typeof resource === 'number') {
    return undefined;
  }

  if (isDerived(resource) || isSlot(resource)) {
    return getTypeForIndexAccess(resource.value as Wgsl);
  }

  if (isWgslData(resource)) {
    // array
    if (isWgslArray(resource)) {
      return resource.elementType;
    }

    // vector or matrix
    if (resource.type in indexableTypeToResult) {
      return indexableTypeToResult[
        resource.type as keyof typeof indexableTypeToResult
      ];
    }
  }

  return undefined;
}

export function getTypeFromWgsl(resource: Wgsl): AnyWgslData | UnknownData {
  if (isDerived(resource) || isSlot(resource)) {
    return getTypeFromWgsl(resource.value as Wgsl);
  }

  if (typeof resource === 'string') {
    return UnknownData;
  }
  if (typeof resource === 'number') {
    return numericLiteralToResource(String(resource))?.dataType ?? UnknownData;
  }
  if (typeof resource === 'boolean') {
    return bool;
  }

  return isWgslData(resource) ? resource : UnknownData;
}

export function numericLiteralToResource(value: string): Resource | undefined {
  // Hex literals
  if (/^0x[0-9a-f]+$/i.test(value)) {
    return { value, dataType: abstractInt };
  }

  // Binary literals
  if (/^0b[01]+$/i.test(value)) {
    return {
      value: `${Number.parseInt(value.slice(2), 2)}`,
      dataType: abstractInt,
    };
  }

  // Floating point literals
  if (/^-?(?:\d+\.\d*|\d*\.\d+)$/i.test(value)) {
    return { value, dataType: abstractFloat };
  }

  // Floating point literals with scientific notation
  if (/^-?\d+(?:\.\d+)?e-?\d+$/i.test(value)) {
    return { value, dataType: abstractFloat };
  }

  // Integer literals
  if (/^-?\d+$/i.test(value)) {
    return { value, dataType: abstractInt };
  }

  return undefined;
}
