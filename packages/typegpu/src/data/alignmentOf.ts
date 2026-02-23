import { safeStringify } from '../shared/stringify.ts';
import {
  type AnyData,
  getCustomAlignment,
  isDisarray,
  isLooseDecorated,
  isUnstruct,
} from './dataTypes.ts';
import { packedFormats } from './vertexFormatData.ts';
import {
  type BaseData,
  isDecorated,
  isWgslArray,
  isWgslStruct,
} from './wgslTypes.ts';

const knownAlignmentMap: Record<string, number> = {
  f32: 4,
  f16: 2,
  i32: 4,
  u32: 4,
  bool: 4,
  u16: 2,
  vec2f: 8,
  vec2h: 4,
  vec2i: 8,
  vec2u: 8,
  vec2b: 8,
  vec3f: 16,
  vec3h: 8,
  vec3i: 16,
  vec3u: 16,
  vec3b: 16,
  vec4f: 16,
  vec4h: 8,
  vec4i: 16,
  vec4u: 16,
  vec4b: 16,
  mat2x2f: 8,
  mat3x3f: 16,
  mat4x4f: 16,
  atomic: 4,
};

function computeAlignment(data: object): number {
  const dataType = (data as BaseData)?.type;
  const knownAlignment = knownAlignmentMap[dataType];
  if (knownAlignment !== undefined) {
    return knownAlignment;
  }

  if (isWgslStruct(data)) {
    return Object.values(data.propTypes)
      .map(alignmentOf)
      .reduce((a, b) => (a > b ? a : b));
  }

  if (isWgslArray(data)) {
    return alignmentOf(data.elementType);
  }

  if (isUnstruct(data)) {
    // A loose struct is aligned to its first property.
    const firstProp = Object.values(data.propTypes)[0];
    return firstProp ? (getCustomAlignment(firstProp) ?? 1) : 1;
  }

  if (isDisarray(data)) {
    return getCustomAlignment(data.elementType) ?? 1;
  }

  if (isDecorated(data) || isLooseDecorated(data)) {
    return getCustomAlignment(data) ?? alignmentOf(data.inner);
  }

  if (packedFormats.has(dataType)) {
    return 1;
  }

  throw new Error(
    `Cannot determine alignment of data: ${safeStringify(data)}`,
  );
}

function computeCustomAlignment(data: BaseData): number {
  if (isUnstruct(data)) {
    // A loose struct is aligned to its first property.
    const firstProp = Object.values(data.propTypes)[0];
    return firstProp ? customAlignmentOf(firstProp) : 1;
  }

  if (isDisarray(data)) {
    return customAlignmentOf(data.elementType);
  }

  if (isLooseDecorated(data)) {
    return getCustomAlignment(data) ?? customAlignmentOf(data.inner);
  }

  return getCustomAlignment(data) ?? 1;
}

/**
 * Since alignments can be inferred from data types, they are not stored on them.
 * Instead, this weak map acts as an extended property of those data types.
 */
const cachedAlignments = new WeakMap<object, number>();

const cachedCustomAlignments = new WeakMap<object, number>();

export function alignmentOf(data: BaseData): number {
  let alignment = cachedAlignments.get(data);
  if (alignment === undefined) {
    alignment = computeAlignment(data);
    cachedAlignments.set(data, alignment);
  }

  return alignment;
}

export function customAlignmentOf(data: BaseData): number {
  let alignment = cachedCustomAlignments.get(data);
  if (alignment === undefined) {
    alignment = computeCustomAlignment(data);
    cachedCustomAlignments.set(data, alignment);
  }

  return alignment;
}

/**
 * Returns the alignment (in bytes) of data represented by the `schema`.
 */
export function PUBLIC_alignmentOf(schema: AnyData): number {
  return alignmentOf(schema);
}
