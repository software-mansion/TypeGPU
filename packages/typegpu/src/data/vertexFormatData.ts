import type { Infer } from '../shared/repr';
import type { VertexFormat } from '../shared/vertexFormat';
import { f16, f32, i32, u32 } from './numeric';
import {
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from './vector';

export type FormatToWGSLType<T extends VertexFormat> =
  (typeof formatToWGSLType)[T];

export interface TgpuVertexFormatData<T extends VertexFormat> {
  readonly '~repr': Infer<FormatToWGSLType<T>>;
  readonly type: T;
}

class TgpuVertexFormatDataImpl<T extends VertexFormat>
  implements TgpuVertexFormatData<T>
{
  /** Used as a type-token for the `Infer<T>` functionality. */
  public readonly '~repr'!: Infer<FormatToWGSLType<T>>;

  constructor(public readonly type: T) {}
}

const formatToWGSLType = {
  uint8: u32,
  uint8x2: vec2u,
  uint8x4: vec4u,
  sint8: i32,
  sint8x2: vec2i,
  sint8x4: vec4i,
  unorm8: f32,
  unorm8x2: vec2f,
  unorm8x4: vec4f,
  snorm8: f32,
  snorm8x2: vec2f,
  snorm8x4: vec4f,
  uint16: u32,
  uint16x2: vec2u,
  uint16x4: vec4u,
  sint16: i32,
  sint16x2: vec2i,
  sint16x4: vec4i,
  unorm16: f32,
  unorm16x2: vec2f,
  unorm16x4: vec4f,
  snorm16: f32,
  snorm16x2: vec2f,
  snorm16x4: vec4f,
  float16: f32,
  float16x2: vec2f,
  float16x4: vec4f,
  float32: f32,
  float32x2: vec2f,
  float32x3: vec3f,
  float32x4: vec4f,
  uint32: u32,
  uint32x2: vec2u,
  uint32x3: vec3u,
  uint32x4: vec4u,
  sint32: i32,
  sint32x2: vec2i,
  sint32x3: vec3i,
  sint32x4: vec4i,
  'unorm10-10-10-2': vec4f,
  'unorm8x4-bgra': vec4f,

  // F16 variants
  unorm8h: f16,
  unorm8x2h: vec2h,
  unorm8x4h: vec4h,
  snorm8h: f16,
  snorm8x2h: vec2h,
  snorm8x4h: vec4h,
  unorm16h: f16,
  unorm16x2h: vec2h,
  unorm16x4h: vec4h,
  snorm16h: f16,
  snorm16x2h: vec2h,
  snorm16x4h: vec4h,
  float16h: f16,
  float16x2h: vec2h,
  float16x4h: vec4h,
  float32h: f16,
  float32x2h: vec2h,
  float32x3h: vec3h,
  float32x4h: vec4h,
  'unorm10-10-10-2h': vec4h,
  'unorm8x4-bgrah': vec4h,
} as const;

export const packedFormats = Object.keys(formatToWGSLType);

export type uint8 = TgpuVertexFormatData<'uint8'>;
export const uint8 = new TgpuVertexFormatDataImpl('uint8') as uint8;

export type uint8x2 = TgpuVertexFormatData<'uint8x2'>;
export const uint8x2 = new TgpuVertexFormatDataImpl('uint8x2') as uint8x2;

export type uint8x4 = TgpuVertexFormatData<'uint8x4'>;
export const uint8x4 = new TgpuVertexFormatDataImpl('uint8x4') as uint8x4;

export type sint8 = TgpuVertexFormatData<'sint8'>;
export const sint8 = new TgpuVertexFormatDataImpl('sint8') as sint8;

export type sint8x2 = TgpuVertexFormatData<'sint8x2'>;
export const sint8x2 = new TgpuVertexFormatDataImpl('sint8x2') as sint8x2;

export type sint8x4 = TgpuVertexFormatData<'sint8x4'>;
export const sint8x4 = new TgpuVertexFormatDataImpl('sint8x4') as sint8x4;

export type unorm8 = TgpuVertexFormatData<'unorm8'>;
export const unorm8 = new TgpuVertexFormatDataImpl('unorm8') as unorm8;

export type unorm8x2 = TgpuVertexFormatData<'unorm8x2'>;
export const unorm8x2 = new TgpuVertexFormatDataImpl('unorm8x2') as unorm8x2;

export type unorm8x4 = TgpuVertexFormatData<'unorm8x4'>;
export const unorm8x4 = new TgpuVertexFormatDataImpl('unorm8x4') as unorm8x4;

export type snorm8 = TgpuVertexFormatData<'snorm8'>;
export const snorm8 = new TgpuVertexFormatDataImpl('snorm8') as snorm8;

export type snorm8x2 = TgpuVertexFormatData<'snorm8x2'>;
export const snorm8x2 = new TgpuVertexFormatDataImpl('snorm8x2') as snorm8x2;

export type snorm8x4 = TgpuVertexFormatData<'snorm8x4'>;
export const snorm8x4 = new TgpuVertexFormatDataImpl('snorm8x4') as snorm8x4;

export type uint16 = TgpuVertexFormatData<'uint16'>;
export const uint16 = new TgpuVertexFormatDataImpl('uint16') as uint16;

export type uint16x2 = TgpuVertexFormatData<'uint16x2'>;
export const uint16x2 = new TgpuVertexFormatDataImpl('uint16x2') as uint16x2;

export type uint16x4 = TgpuVertexFormatData<'uint16x4'>;
export const uint16x4 = new TgpuVertexFormatDataImpl('uint16x4') as uint16x4;

export type sint16 = TgpuVertexFormatData<'sint16'>;
export const sint16 = new TgpuVertexFormatDataImpl('sint16') as sint16;

export type sint16x2 = TgpuVertexFormatData<'sint16x2'>;
export const sint16x2 = new TgpuVertexFormatDataImpl('sint16x2') as sint16x2;

export type sint16x4 = TgpuVertexFormatData<'sint16x4'>;
export const sint16x4 = new TgpuVertexFormatDataImpl('sint16x4') as sint16x4;

export type unorm16 = TgpuVertexFormatData<'unorm16'>;
export const unorm16 = new TgpuVertexFormatDataImpl('unorm16') as unorm16;

export type unorm16x2 = TgpuVertexFormatData<'unorm16x2'>;
export const unorm16x2 = new TgpuVertexFormatDataImpl('unorm16x2') as unorm16x2;

export type unorm16x4 = TgpuVertexFormatData<'unorm16x4'>;
export const unorm16x4 = new TgpuVertexFormatDataImpl('unorm16x4') as unorm16x4;

export type snorm16 = TgpuVertexFormatData<'snorm16'>;
export const snorm16 = new TgpuVertexFormatDataImpl('snorm16') as snorm16;

export type snorm16x2 = TgpuVertexFormatData<'snorm16x2'>;
export const snorm16x2 = new TgpuVertexFormatDataImpl('snorm16x2') as snorm16x2;

export type snorm16x4 = TgpuVertexFormatData<'snorm16x4'>;
export const snorm16x4 = new TgpuVertexFormatDataImpl('snorm16x4') as snorm16x4;

export type float16 = TgpuVertexFormatData<'float16'>;
export const float16 = new TgpuVertexFormatDataImpl('float16') as float16;

export type float16x2 = TgpuVertexFormatData<'float16x2'>;
export const float16x2 = new TgpuVertexFormatDataImpl('float16x2') as float16x2;

export type float16x4 = TgpuVertexFormatData<'float16x4'>;
export const float16x4 = new TgpuVertexFormatDataImpl('float16x4') as float16x4;

export type float32 = TgpuVertexFormatData<'float32'>;
export const float32 = new TgpuVertexFormatDataImpl('float32') as float32;

export type float32x2 = TgpuVertexFormatData<'float32x2'>;
export const float32x2 = new TgpuVertexFormatDataImpl('float32x2') as float32x2;

export type float32x3 = TgpuVertexFormatData<'float32x3'>;
export const float32x3 = new TgpuVertexFormatDataImpl('float32x3') as float32x3;

export type float32x4 = TgpuVertexFormatData<'float32x4'>;
export const float32x4 = new TgpuVertexFormatDataImpl('float32x4') as float32x4;

export type uint32 = TgpuVertexFormatData<'uint32'>;
export const uint32 = new TgpuVertexFormatDataImpl('uint32') as uint32;

export type uint32x2 = TgpuVertexFormatData<'uint32x2'>;
export const uint32x2 = new TgpuVertexFormatDataImpl('uint32x2') as uint32x2;

export type uint32x3 = TgpuVertexFormatData<'uint32x3'>;
export const uint32x3 = new TgpuVertexFormatDataImpl('uint32x3') as uint32x3;

export type uint32x4 = TgpuVertexFormatData<'uint32x4'>;
export const uint32x4 = new TgpuVertexFormatDataImpl('uint32x4') as uint32x4;

export type sint32 = TgpuVertexFormatData<'sint32'>;
export const sint32 = new TgpuVertexFormatDataImpl('sint32') as sint32;

export type sint32x2 = TgpuVertexFormatData<'sint32x2'>;
export const sint32x2 = new TgpuVertexFormatDataImpl('sint32x2') as sint32x2;

export type sint32x3 = TgpuVertexFormatData<'sint32x3'>;
export const sint32x3 = new TgpuVertexFormatDataImpl('sint32x3') as sint32x3;

export type sint32x4 = TgpuVertexFormatData<'sint32x4'>;
export const sint32x4 = new TgpuVertexFormatDataImpl('sint32x4') as sint32x4;

export type unorm10_10_10_2 = TgpuVertexFormatData<'unorm10-10-10-2'>;
export const unorm10_10_10_2 = new TgpuVertexFormatDataImpl(
  'unorm10-10-10-2',
) as unorm10_10_10_2;

export type unorm8x4_bgra = TgpuVertexFormatData<'unorm8x4-bgra'>;
export const unorm8x4_bgra = new TgpuVertexFormatDataImpl(
  'unorm8x4-bgra',
) as unorm8x4_bgra;

export type unorm8h = TgpuVertexFormatData<'unorm8h'>;
export const unorm8h = new TgpuVertexFormatDataImpl('unorm8h') as unorm8h;

export type unorm8x2h = TgpuVertexFormatData<'unorm8x2h'>;
export const unorm8x2h = new TgpuVertexFormatDataImpl('unorm8x2h') as unorm8x2h;

export type unorm8x4h = TgpuVertexFormatData<'unorm8x4h'>;
export const unorm8x4h = new TgpuVertexFormatDataImpl('unorm8x4h') as unorm8x4h;

export type snorm8h = TgpuVertexFormatData<'snorm8h'>;
export const snorm8h = new TgpuVertexFormatDataImpl('snorm8h') as snorm8h;

export type snorm8x2h = TgpuVertexFormatData<'snorm8x2h'>;
export const snorm8x2h = new TgpuVertexFormatDataImpl('snorm8x2h') as snorm8x2h;

export type snorm8x4h = TgpuVertexFormatData<'snorm8x4h'>;
export const snorm8x4h = new TgpuVertexFormatDataImpl('snorm8x4h') as snorm8x4h;

export type unorm16h = TgpuVertexFormatData<'unorm16h'>;
export const unorm16h = new TgpuVertexFormatDataImpl('unorm16h') as unorm16h;

export type unorm16x2h = TgpuVertexFormatData<'unorm16x2h'>;
export const unorm16x2h = new TgpuVertexFormatDataImpl(
  'unorm16x2h',
) as unorm16x2h;

export type unorm16x4h = TgpuVertexFormatData<'unorm16x4h'>;
export const unorm16x4h = new TgpuVertexFormatDataImpl(
  'unorm16x4h',
) as unorm16x4h;

export type snorm16h = TgpuVertexFormatData<'snorm16h'>;
export const snorm16h = new TgpuVertexFormatDataImpl('snorm16h') as snorm16h;

export type snorm16x2h = TgpuVertexFormatData<'snorm16x2h'>;
export const snorm16x2h = new TgpuVertexFormatDataImpl(
  'snorm16x2h',
) as snorm16x2h;

export type snorm16x4h = TgpuVertexFormatData<'snorm16x4h'>;
export const snorm16x4h = new TgpuVertexFormatDataImpl(
  'snorm16x4h',
) as snorm16x4h;

export type float16h = TgpuVertexFormatData<'float16h'>;
export const float16h = new TgpuVertexFormatDataImpl('float16h') as float16h;

export type float16x2h = TgpuVertexFormatData<'float16x2h'>;
export const float16x2h = new TgpuVertexFormatDataImpl(
  'float16x2h',
) as float16x2h;

export type float16x4h = TgpuVertexFormatData<'float16x4h'>;
export const float16x4h = new TgpuVertexFormatDataImpl(
  'float16x4h',
) as float16x4h;

export type float32h = TgpuVertexFormatData<'float32h'>;
export const float32h = new TgpuVertexFormatDataImpl('float32h') as float32h;

export type float32x2h = TgpuVertexFormatData<'float32x2h'>;
export const float32x2h = new TgpuVertexFormatDataImpl(
  'float32x2h',
) as float32x2h;

export type float32x3h = TgpuVertexFormatData<'float32x3h'>;
export const float32x3h = new TgpuVertexFormatDataImpl(
  'float32x3h',
) as float32x3h;

export type float32x4h = TgpuVertexFormatData<'float32x4h'>;
export const float32x4h = new TgpuVertexFormatDataImpl(
  'float32x4h',
) as float32x4h;

export type unorm10_10_10_2h = TgpuVertexFormatData<'unorm10-10-10-2h'>;
export const unorm10_10_10_2h = new TgpuVertexFormatDataImpl(
  'unorm10-10-10-2h',
) as unorm10_10_10_2h;

export type unorm8x4_bgrah = TgpuVertexFormatData<'unorm8x4-bgrah'>;
export const unorm8x4_bgrah = new TgpuVertexFormatDataImpl(
  'unorm8x4-bgrah',
) as unorm8x4_bgrah;

export type PackedData =
  | uint8
  | uint8x2
  | uint8x4
  | sint8
  | sint8x2
  | sint8x4
  | unorm8
  | unorm8x2
  | unorm8x4
  | snorm8
  | snorm8x2
  | snorm8x4
  | uint16
  | uint16x2
  | uint16x4
  | sint16
  | sint16x2
  | sint16x4
  | unorm16
  | unorm16x2
  | unorm16x4
  | snorm16
  | snorm16x2
  | snorm16x4
  | float16
  | float16x2
  | float16x4
  | float32
  | float32x2
  | float32x3
  | float32x4
  | uint32
  | uint32x2
  | uint32x3
  | uint32x4
  | sint32
  | sint32x2
  | sint32x3
  | sint32x4
  | unorm10_10_10_2
  | unorm8x4_bgra
  | unorm8h
  | unorm8x2h
  | unorm8x4h
  | snorm8h
  | snorm8x2h
  | snorm8x4h
  | unorm16h
  | unorm16x2h
  | unorm16x4h
  | snorm16h
  | snorm16x2h
  | snorm16x4h
  | float16h
  | float16x2h
  | float16x4h
  | float32h
  | float32x2h
  | float32x3h
  | float32x4h
  | unorm10_10_10_2h
  | unorm8x4_bgrah;
