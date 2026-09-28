import type { d } from 'typegpu';

/** Every vertex format TypeGPU defines */
export type VertexFormat = keyof typeof d.formatToWGSLType;

type ComponentType =
  | 'BYTE'
  | 'UNSIGNED_BYTE'
  | 'SHORT'
  | 'UNSIGNED_SHORT'
  | 'INT'
  | 'UNSIGNED_INT'
  | 'HALF_FLOAT'
  | 'FLOAT'
  | 'UNSIGNED_INT_2_10_10_10_REV';

export interface VertexFormatInfo {
  /** Components per vertex, the `size` parameter of `vertexAttrib(I)Pointer` */
  readonly size: 1 | 2 | 3 | 4;
  readonly type: ComponentType;
  /** Whether integer data is normalized to [0, 1] (unorm) or [-1, 1] (snorm) */
  readonly normalized: boolean;
  /** Whether the shader reads it as integers, through `vertexAttribIPointer` */
  readonly integer: boolean;
  /**
   * A swizzle the shader applies to the attribute. The component order of
   * 'unorm8x4-bgra' can't be described to WebGL 2 (BGRA sizes are desktop GL only),
   * so it's read as 'unorm8x4', and reordered in the shader.
   */
  readonly swizzle?: string;
}

const uint = (size: 1 | 2 | 3 | 4, type: ComponentType): VertexFormatInfo => ({
  size,
  type,
  normalized: false,
  integer: true,
});
const norm = (size: 1 | 2 | 3 | 4, type: ComponentType): VertexFormatInfo => ({
  size,
  type,
  normalized: true,
  integer: false,
});
const float = (size: 1 | 2 | 3 | 4, type: ComponentType): VertexFormatInfo => ({
  size,
  type,
  normalized: false,
  integer: false,
});

/**
 * Every vertex format TypeGPU (and WebGPU) defines, and how WebGL 2 reads it.
 */
export const vertexFormatInfo: Readonly<Record<VertexFormat, VertexFormatInfo>> = {
  uint8: uint(1, 'UNSIGNED_BYTE'),
  uint8x2: uint(2, 'UNSIGNED_BYTE'),
  uint8x4: uint(4, 'UNSIGNED_BYTE'),
  sint8: uint(1, 'BYTE'),
  sint8x2: uint(2, 'BYTE'),
  sint8x4: uint(4, 'BYTE'),
  unorm8: norm(1, 'UNSIGNED_BYTE'),
  unorm8x2: norm(2, 'UNSIGNED_BYTE'),
  unorm8x4: norm(4, 'UNSIGNED_BYTE'),
  snorm8: norm(1, 'BYTE'),
  snorm8x2: norm(2, 'BYTE'),
  snorm8x4: norm(4, 'BYTE'),
  uint16: uint(1, 'UNSIGNED_SHORT'),
  uint16x2: uint(2, 'UNSIGNED_SHORT'),
  uint16x4: uint(4, 'UNSIGNED_SHORT'),
  sint16: uint(1, 'SHORT'),
  sint16x2: uint(2, 'SHORT'),
  sint16x4: uint(4, 'SHORT'),
  unorm16: norm(1, 'UNSIGNED_SHORT'),
  unorm16x2: norm(2, 'UNSIGNED_SHORT'),
  unorm16x4: norm(4, 'UNSIGNED_SHORT'),
  snorm16: norm(1, 'SHORT'),
  snorm16x2: norm(2, 'SHORT'),
  snorm16x4: norm(4, 'SHORT'),
  float16: float(1, 'HALF_FLOAT'),
  float16x2: float(2, 'HALF_FLOAT'),
  float16x4: float(4, 'HALF_FLOAT'),
  float32: float(1, 'FLOAT'),
  float32x2: float(2, 'FLOAT'),
  float32x3: float(3, 'FLOAT'),
  float32x4: float(4, 'FLOAT'),
  uint32: uint(1, 'UNSIGNED_INT'),
  uint32x2: uint(2, 'UNSIGNED_INT'),
  uint32x3: uint(3, 'UNSIGNED_INT'),
  uint32x4: uint(4, 'UNSIGNED_INT'),
  sint32: uint(1, 'INT'),
  sint32x2: uint(2, 'INT'),
  sint32x3: uint(3, 'INT'),
  sint32x4: uint(4, 'INT'),
  // Both put the first component in the lowest bits of a little-endian u32
  'unorm10-10-10-2': norm(4, 'UNSIGNED_INT_2_10_10_10_REV'),
  'unorm8x4-bgra': { ...norm(4, 'UNSIGNED_BYTE'), swizzle: 'zyxw' },
};
