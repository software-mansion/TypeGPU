import type { LooseTypeLiteral } from './dataTypes';
import type { BaseWgslData, WgslTypeLiteral } from './wgslTypes';

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

export function sizeOf(data: unknown) {
  return (
    knownSizesMap[(data as BaseWgslData)?.type] ??
    (data as { size: number }).size ??
    Number.NaN
  );
}
