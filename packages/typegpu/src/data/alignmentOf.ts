import { getCustomAlignment } from './attributes';
import { isDecorated, isLooseDecorated } from './attributes';
import { isLooseArray } from './looseArray';
import { isLooseStructSchema } from './looseStruct';
import { type BaseWgslData, isArraySchema, isStructSchema } from './wgslTypes';

const knownAlignmentMap: Record<string, number> = {
  bool: 4,
  f32: 4,
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
  const knownAlignment = knownAlignmentMap[(data as BaseWgslData)?.type];
  if (knownAlignment !== undefined) {
    return knownAlignment;
  }

  if (isStructSchema(data)) {
    return Object.values(data.propTypes)
      .map((prop) => alignmentOf(prop))
      .reduce((a, b) => (a > b ? a : b));
  }

  if (isArraySchema(data)) {
    return alignmentOf(data.elementType);
  }

  if (isLooseStructSchema(data)) {
    return 1;
  }

  if (isLooseArray(data)) {
    return getCustomAlignment(data.elementType) ?? 1;
  }

  if (isDecorated(data) || isLooseDecorated(data)) {
    return getCustomAlignment(data) ?? alignmentOf(data.inner);
  }

  throw new Error(
    `Cannot determine alignment of data: ${JSON.stringify(data)}`,
  );
}

/**
 * Since alignments can be inferred from exotic/native data types, they are
 * not stored on them. Instead, this weak map acts as an extended property
 * of those data types.
 */
const cachedAlignments = new WeakMap<object, number>();

export function alignmentOf(data: object): number {
  let alignment = cachedAlignments.get(data);
  if (alignment === undefined) {
    alignment = computeAlignment(data);
    cachedAlignments.set(data, alignment);
  }

  return alignment;
}
