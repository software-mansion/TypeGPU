import type { BaseWgslData } from './wgslTypes';

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

export function alignmentOf(data: unknown) {
  return (
    knownAlignmentMap[(data as BaseWgslData)?.type] ??
    (data as { alignment: number }).alignment ??
    0
  );
}
