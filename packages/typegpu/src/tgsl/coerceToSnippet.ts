import { type AnyData, UnknownData } from '../data/dataTypes.ts';
import { mat2x2f, mat3x3f, mat4x4f } from '../data/matrix.ts';
import { bool } from '../data/numeric.ts';
import { isSnippet, snip, type Snippet } from '../data/snippet.ts';
import * as vec from '../data/vector.ts';
import {
  hasInternalDataType,
  isMatInstance,
  isVecInstance,
} from '../data/wgslTypes.ts';
import { $wgslDataType } from '../shared/symbols.ts';
import { numericLiteralToSnippet } from './numericLiteral.ts';

const kindToSchema = {
  vec2f: vec.vec2f,
  vec2h: vec.vec2h,
  vec2i: vec.vec2i,
  vec2u: vec.vec2u,
  'vec2<bool>': vec.vec2b,
  vec3f: vec.vec3f,
  vec3h: vec.vec3h,
  vec3i: vec.vec3i,
  vec3u: vec.vec3u,
  'vec3<bool>': vec.vec3b,
  vec4f: vec.vec4f,
  vec4h: vec.vec4h,
  vec4i: vec.vec4i,
  vec4u: vec.vec4u,
  'vec4<bool>': vec.vec4b,
  mat2x2f: mat2x2f,
  mat3x3f: mat3x3f,
  mat4x4f: mat4x4f,
} as const;

export function coerceToSnippet(value: unknown): Snippet {
  if (isSnippet(value)) {
    // Already a snippet
    return value;
  }

  if (hasInternalDataType(value)) {
    // The value knows better about what type it is
    return snip(value, value[$wgslDataType] as AnyData);
  }

  if (isVecInstance(value) || isMatInstance(value)) {
    return snip(value, kindToSchema[value.kind]);
  }

  if (
    typeof value === 'string' || typeof value === 'function' ||
    typeof value === 'object' || typeof value === 'symbol' ||
    typeof value === 'undefined' || value === null
  ) {
    // Nothing representable in WGSL as-is, so unknown
    return snip(value, UnknownData);
  }

  if (typeof value === 'number') {
    return numericLiteralToSnippet(value);
  }

  if (typeof value === 'boolean') {
    return snip(value, bool);
  }

  return snip(value, UnknownData);
}
