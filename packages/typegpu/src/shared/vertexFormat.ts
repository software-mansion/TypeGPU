export const vertexFormats = [
  'uint8',
  'uint8x2',
  'uint8x4',
  'sint8',
  'sint8x2',
  'sint8x4',
  'unorm8',
  'unorm8x2',
  'unorm8x4',
  'snorm8',
  'snorm8x2',
  'snorm8x4',
  'uint16',
  'uint16x2',
  'uint16x4',
  'sint16',
  'sint16x2',
  'sint16x4',
  'unorm16',
  'unorm16x2',
  'unorm16x4',
  'snorm16',
  'snorm16x2',
  'snorm16x4',
  'float16',
  'float16x2',
  'float16x4',
  'float32',
  'float32x2',
  'float32x3',
  'float32x4',
  'uint32',
  'uint32x2',
  'uint32x3',
  'uint32x4',
  'sint32',
  'sint32x2',
  'sint32x3',
  'sint32x4',
  'unorm10-10-10-2',
  'unorm8x4-bgra',
] as const;

export type VertexFormat = (typeof vertexFormats)[number];

export const kindToDefaultFormatMap = {
  f32: 'float32',
  vec2f: 'float32x2',
  vec3f: 'float32x3',
  vec4f: 'float32x4',
  f16: 'float16',
  vec2h: 'float16x2',
  // vec3h has no direct equivalent in the spec
  vec4h: 'float16x4',
  u32: 'uint32',
  vec2u: 'uint32x2',
  vec3u: 'uint32x3',
  vec4u: 'uint32x4',
  i32: 'sint32',
  vec2i: 'sint32x2',
  vec3i: 'sint32x3',
  vec4i: 'sint32x4',
} as const;

export type KindToDefaultFormatMap = typeof kindToDefaultFormatMap;

export interface TgpuVertexAttrib<TFormat extends VertexFormat = VertexFormat> {
  readonly format: TFormat;
  readonly offset: number;
}

export type AnyVertexAttribs = Record<string, TgpuVertexAttrib> | TgpuVertexAttrib;

/**
 * All vertex attribute formats that can be interpreted as
 * an single or multi component u32 in a shader.
 * https://www.w3.org/TR/webgpu/#vertex-formats
 */
type U32CompatibleFormats =
  | TgpuVertexAttrib<'uint8'>
  | TgpuVertexAttrib<'uint8x2'>
  | TgpuVertexAttrib<'uint8x4'>
  | TgpuVertexAttrib<'uint16'>
  | TgpuVertexAttrib<'uint16x2'>
  | TgpuVertexAttrib<'uint16x4'>
  | TgpuVertexAttrib<'uint32'>
  | TgpuVertexAttrib<'uint32x2'>
  | TgpuVertexAttrib<'uint32x3'>
  | TgpuVertexAttrib<'uint32x4'>;

/**
 * All vertex attribute formats that can be interpreted as
 * an single or multi component i32 in a shader.
 * https://www.w3.org/TR/webgpu/#vertex-formats
 */
type I32CompatibleFormats =
  | TgpuVertexAttrib<'sint8'>
  | TgpuVertexAttrib<'sint8x2'>
  | TgpuVertexAttrib<'sint8x4'>
  | TgpuVertexAttrib<'sint16'>
  | TgpuVertexAttrib<'sint16x2'>
  | TgpuVertexAttrib<'sint16x4'>
  | TgpuVertexAttrib<'sint32'>
  | TgpuVertexAttrib<'sint32x2'>
  | TgpuVertexAttrib<'sint32x3'>
  | TgpuVertexAttrib<'sint32x4'>;

/**
 * All vertex attribute formats that can be interpreted as
 * an single or multi component f32 in a shader.
 * https://www.w3.org/TR/webgpu/#vertex-formats
 */
type F32CompatibleFormats =
  | TgpuVertexAttrib<'unorm8'>
  | TgpuVertexAttrib<'unorm8x2'>
  | TgpuVertexAttrib<'unorm8x4'>
  | TgpuVertexAttrib<'snorm8'>
  | TgpuVertexAttrib<'snorm8x2'>
  | TgpuVertexAttrib<'snorm8x4'>
  | TgpuVertexAttrib<'unorm16'>
  | TgpuVertexAttrib<'unorm16x2'>
  | TgpuVertexAttrib<'unorm16x4'>
  | TgpuVertexAttrib<'snorm16'>
  | TgpuVertexAttrib<'snorm16x2'>
  | TgpuVertexAttrib<'snorm16x4'>
  | TgpuVertexAttrib<'float16'>
  | TgpuVertexAttrib<'float16x2'>
  | TgpuVertexAttrib<'float16x4'>
  | TgpuVertexAttrib<'float32'>
  | TgpuVertexAttrib<'float32x2'>
  | TgpuVertexAttrib<'float32x3'>
  | TgpuVertexAttrib<'float32x4'>
  | TgpuVertexAttrib<'unorm10-10-10-2'>
  | TgpuVertexAttrib<'unorm8x4-bgra'>;

/**
 * All vertex attribute formats that can be interpreted as
 * a single or multi component f16 in a shader. (same as f32 on the shader side)
 * https://www.w3.org/TR/webgpu/#vertex-formats
 */
type F16CompatibleFormats = F32CompatibleFormats;

export type KindToAcceptedAttribMap = {
  u32: U32CompatibleFormats;
  vec2u: U32CompatibleFormats;
  vec3u: U32CompatibleFormats;
  vec4u: U32CompatibleFormats;

  i32: I32CompatibleFormats;
  vec2i: I32CompatibleFormats;
  vec3i: I32CompatibleFormats;
  vec4i: I32CompatibleFormats;

  f16: F16CompatibleFormats;
  vec2h: F16CompatibleFormats;
  vec3h: F16CompatibleFormats;
  vec4h: F16CompatibleFormats;

  f32: F32CompatibleFormats;
  vec2f: F32CompatibleFormats;
  vec3f: F32CompatibleFormats;
  vec4f: F32CompatibleFormats;
};
