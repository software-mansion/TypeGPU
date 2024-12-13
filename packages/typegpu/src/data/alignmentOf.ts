import {
  type AnyData,
  getCustomAlignment,
  isLooseArray,
  isLooseDecorated,
  isLooseStruct,
} from './dataTypes';
import { packedFormats } from './vertexFormatData';
import {
  type BaseWgslData,
  isDecorated,
  isWgslArray,
  isWgslStruct,
} from './wgslTypes';

const knownAlignmentMap: Record<string, number> = {
  bool: 4,
  f32: 4,
  f16: 2,
  i32: 4,
  u32: 4,
  vec2f: 8,
  vec2i: 8,
  vec2u: 8,
  vec3f: 16,
  vec3i: 16,
  vec3u: 16,
  vec4f: 16,
  vec4i: 16,
  vec4u: 16,
  mat2x2f: 8,
  mat3x3f: 16,
  mat4x4f: 16,
};

function computeAlignment(data: object): number {
  const dataType = (data as BaseWgslData)?.type;
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

  if (isLooseStruct(data)) {
    // A loose struct is aligned to its first property.
    const firstProp = Object.values(data.propTypes)[0];
    return firstProp ? getCustomAlignment(firstProp) ?? 1 : 1;
  }

  if (isLooseArray(data)) {
    return getCustomAlignment(data.elementType) ?? 1;
  }

  if (isDecorated(data) || isLooseDecorated(data)) {
    return getCustomAlignment(data) ?? alignmentOf(data.inner);
  }

  if (packedFormats.includes(dataType)) {
    return 1;
  }

  throw new Error(
    `Cannot determine alignment of data: ${JSON.stringify(data)}`,
  );
}

function computeCustomAlignment(data: BaseWgslData): number {
  if (isLooseStruct(data)) {
    // A loose struct is aligned to its first property.
    const firstProp = Object.values(data.propTypes)[0];
    return firstProp ? customAlignmentOf(firstProp) : 1;
  }

  if (isLooseArray(data)) {
    return customAlignmentOf(data.elementType);
  }

  if (isLooseDecorated(data)) {
    return getCustomAlignment(data) ?? customAlignmentOf(data.inner);
  }

  return getCustomAlignment(data) ?? 1;
}

/**
 * Since alignments can be inferred from exotic/native data types, they are
 * not stored on them. Instead, this weak map acts as an extended property
 * of those data types.
 */
const cachedAlignments = new WeakMap<object, number>();

const cachedCustomAlignments = new WeakMap<object, number>();

export function alignmentOf(data: BaseWgslData): number {
  let alignment = cachedAlignments.get(data);
  if (alignment === undefined) {
    alignment = computeAlignment(data);
    cachedAlignments.set(data, alignment);
  }

  return alignment;
}

export function customAlignmentOf(data: BaseWgslData): number {
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
