import { roundUp } from '../mathUtils';
import { alignmentOf, customAlignmentOf } from './alignmentOf';
import type { AnyData, LooseStruct, LooseTypeLiteral } from './dataTypes';
import {
  getCustomSize,
  isLooseArray,
  isLooseDecorated,
  isLooseStruct,
} from './dataTypes';
import type { BaseWgslData, WgslStruct, WgslTypeLiteral } from './wgslTypes';
import { isDecorated, isWgslArray, isWgslStruct } from './wgslTypes';

const knownSizesMap: Record<string, number> = {
  bool: 4,
  f32: 4,
  i32: 4,
  u32: 4,
  vec2f: 8,
  vec2i: 8,
  vec2u: 8,
  vec3f: 12,
  vec3i: 12,
  vec3u: 12,
  vec4f: 16,
  vec4i: 16,
  vec4u: 16,
  mat2x2f: 16,
  mat3x3f: 48,
  mat4x4f: 64,
  uint8x2: 2,
  uint8x4: 4,
  sint8x2: 2,
  sint8x4: 4,
  unorm8x2: 2,
  unorm8x4: 4,
  snorm8x2: 2,
  snorm8x4: 4,
  uint16x2: 4,
  uint16x4: 8,
  sint16x2: 4,
  sint16x4: 8,
  unorm16x2: 4,
  unorm16x4: 8,
  snorm16x2: 4,
  snorm16x4: 8,
  float16x2: 4,
  float16x4: 8,
  float32: 4,
  float32x2: 8,
  float32x3: 12,
  float32x4: 16,
  uint32: 4,
  uint32x2: 8,
  uint32x3: 12,
  uint32x4: 16,
  sint32: 4,
  sint32x2: 8,
  sint32x3: 12,
  sint32x4: 16,
  'unorm10-10-10-2': 4,
} satisfies Partial<Record<WgslTypeLiteral | LooseTypeLiteral, number>>;

function sizeOfStruct(struct: WgslStruct) {
  let size = 0;
  for (const property of Object.values(struct.propTypes)) {
    if (Number.isNaN(size)) {
      throw new Error('Only the last property of a struct can be unbounded');
    }

    size = roundUp(size, alignmentOf(property));
    size += sizeOf(property);

    if (Number.isNaN(size) && property.type !== 'array') {
      throw new Error('Cannot nest unbounded struct within another struct');
    }
  }

  return roundUp(size, alignmentOf(struct));
}

function sizeOfLooseStruct(data: LooseStruct) {
  let size = 0;

  for (const property of Object.values(data.propTypes)) {
    const alignment = customAlignmentOf(property);
    size = roundUp(size, alignment);
    size += sizeOf(property);
  }

  return size;
}

function computeSize(data: object): number {
  const knownSize = knownSizesMap[(data as BaseWgslData)?.type];

  if (knownSize !== undefined) {
    return knownSize;
  }

  if (isWgslStruct(data)) {
    return sizeOfStruct(data);
  }

  if (isLooseStruct(data)) {
    return sizeOfLooseStruct(data);
  }

  if (isWgslArray(data)) {
    if (data.length === 0) {
      return Number.NaN;
    }

    const alignment = alignmentOf(data.elementType);
    const stride = roundUp(sizeOf(data.elementType), alignment);
    return stride * data.length;
  }

  if (isLooseArray(data)) {
    const alignment = customAlignmentOf(data.elementType);
    const stride = roundUp(sizeOf(data.elementType), alignment);
    return stride * data.length;
  }

  if (isDecorated(data) || isLooseDecorated(data)) {
    return getCustomSize(data) ?? sizeOf(data.inner);
  }

  throw new Error(`Cannot determine size of data: ${data}`);
}

/**
 * Since sizes can be inferred from exotic/native data types, they are
 * not stored on them. Instead, this weak map acts as an extended property
 * of those data types.
 */
const cachedSizes = new WeakMap<BaseWgslData, number>();

export function sizeOf(schema: BaseWgslData): number {
  let size = cachedSizes.get(schema);

  if (size === undefined) {
    size = computeSize(schema);
    cachedSizes.set(schema, size);
  }

  return size;
}

/**
 * Returns the size (in bytes) of data represented by the `schema`.
 */
export function PUBLIC_sizeOf(schema: AnyData): number {
  return sizeOf(schema);
}
