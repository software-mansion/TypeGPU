import { isDerived } from '../core/slot/slotTypes';
import { isSlot } from '../core/slot/slotTypes';
import { isDecorated, isWgslData } from '../data';
import * as d from '../data';
import { abstractFloat, abstractInt } from '../data/numeric';
import { type Resource, UnknownData, type Wgsl } from '../types';

const indexableTypes = [
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

const swizzleLenToType: {
  [key in SwizzleableType]: {
    [key in SwizzleLength]: d.AnyWgslData;
  };
} = {
  f: {
    1: d.f32,
    2: d.vec2f,
    3: d.vec3f,
    4: d.vec4f,
  },
  h: {
    1: d.f16,
    2: d.vec2h,
    3: d.vec3h,
    4: d.vec4h,
  },
  i: {
    1: d.i32,
    2: d.vec2i,
    3: d.vec3i,
    4: d.vec4i,
  },
  u: {
    1: d.u32,
    2: d.vec2u,
    3: d.vec3u,
    4: d.vec4u,
  },
} as const;

export function getTypeForPropAccess(
  targetType: Wgsl,
  propName: string,
): d.BaseData | undefined {
  if (
    typeof targetType === 'string' ||
    typeof targetType === 'number' ||
    typeof targetType === 'boolean'
  ) {
    return undefined;
  }

  if (isDerived(targetType) || isSlot(targetType)) {
    return getTypeForPropAccess(targetType.value as Wgsl, propName);
  }

  let target = targetType as d.AnyWgslData;
  if ('dataType' in target) {
    target = target.dataType as d.AnyWgslData;
  }
  while (isDecorated(target)) {
    target = target.inner as d.AnyWgslData;
  }
  const targetTypeStr =
    'kind' in target ? (target.kind as string) : target.type;

  if (targetTypeStr === 'struct') {
    console.log(`got struct: ${target}.${propName}`);
    return (target as d.WgslStruct).propTypes[propName];
  }

  const propLength = propName.length;
  if (
    indexableTypes.includes(targetTypeStr as (typeof indexableTypes)[number]) &&
    propLength >= 1 &&
    propLength <= 4
  ) {
    console.log(`got indexable type: ${target}.${propName}`);
    const swizzleType =
      swizzleLenToType[targetTypeStr[4] as SwizzleableType][
        propLength as SwizzleLength
      ];
    if (swizzleType) {
      return swizzleType;
    }
  }

  console.log(`got unknown type: ${targetType}.${propName}`);
  return undefined;
}

export function getTypeFormWgsl(resource: Wgsl): d.AnyWgslData | UnknownData {
  if (isDerived(resource) || isSlot(resource)) {
    return getTypeFormWgsl(resource.value as Wgsl);
  }

  if (typeof resource === 'string') {
    return UnknownData;
  }
  if (typeof resource === 'number') {
    return numericLiteralToResource(String(resource))?.dataType ?? UnknownData;
  }
  if (typeof resource === 'boolean') {
    return d.bool;
  }

  if (isWgslData(resource)) {
    return resource;
  }

  return UnknownData;
}

export function numericLiteralToResource(value: string): Resource | undefined {
  // Hex literals (since JS does not have float hex literals, we'll assume it's an int)
  const hexRegex = /^0x[0-9a-f]+$/i;
  if (hexRegex.test(value)) {
    return { value: value, dataType: abstractInt };
  }

  // Binary literals
  const binRegex = /^0b[01]+$/i;
  if (binRegex.test(value)) {
    // Since wgsl doesn't support binary literals, we'll convert it to a decimal number
    return {
      value: `${Number.parseInt(value.slice(2), 2)}`,
      dataType: abstractInt,
    };
  }

  const floatRegex = /^-?(?:\d+\.\d*|\d*\.\d+)$/;
  if (floatRegex.test(value)) {
    return { value, dataType: abstractFloat };
  }

  // Floating point literals with scientific notation
  const sciFloatRegex = /^-?\d+\.\d+e-?\d+$/;
  if (sciFloatRegex.test(value)) {
    return {
      value: value,
      dataType: abstractFloat,
    };
  }

  // Integer literals
  const intRegex = /^-?\d+$/;
  if (intRegex.test(value)) {
    return { value: value, dataType: abstractInt };
  }

  return undefined;
}
