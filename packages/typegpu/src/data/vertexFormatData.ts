import type { Infer } from '../shared/repr';
import type { VertexFormat } from '../shared/vertexFormat';
import { f32, i32, u32 } from './numeric';
import {
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from './vector';

export type FormatToWGSLType<T extends VertexFormat> =
  (typeof formatToWGSLType)[T];

export interface TgpuVertexFormatData<T extends VertexFormat> {
  readonly __repr: Infer<FormatToWGSLType<T>>;
  readonly type: T;
}

class TgpuVertexFormatDataImpl<T extends VertexFormat>
  implements TgpuVertexFormatData<T>
{
  /** Used as a type-token for the `Infer<T>` functionality. */
  public readonly __repr!: Infer<FormatToWGSLType<T>>;

  readonly byteAlignment = 1;
  readonly isLoose = true;

  constructor(public readonly type: T) {}
}

const vectorKindToPrimitive = {
  vec2u: 'u32',
  vec3u: 'u32',
  vec4u: 'u32',
  vec2f: 'f32',
  vec3f: 'f32',
  vec4f: 'f32',
  vec2i: 'i32',
  vec3i: 'i32',
  vec4i: 'i32',
} as const;

const formatToWGSLType = {
  uint8x2: vec2u,
  uint8x4: vec4u,
  sint8x2: vec2i,
  sint8x4: vec4i,
  unorm8x2: vec2f,
  unorm8x4: vec4f,
  snorm8x2: vec2f,
  snorm8x4: vec4f,
  uint16x2: vec2u,
  uint16x4: vec4u,
  sint16x2: vec2i,
  sint16x4: vec4i,
  unorm16x2: vec2f,
  unorm16x4: vec4f,
  snorm16x2: vec2f,
  snorm16x4: vec4f,
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
} as const;

export type uint8x2 = TgpuVertexFormatData<'uint8x2'>;
export const uint8x2 = new TgpuVertexFormatDataImpl('uint8x2') as uint8x2;

export type uint8x4 = TgpuVertexFormatData<'uint8x4'>;
export const uint8x4 = new TgpuVertexFormatDataImpl('uint8x4') as uint8x4;

export type sint8x2 = TgpuVertexFormatData<'sint8x2'>;
export const sint8x2 = new TgpuVertexFormatDataImpl('sint8x2') as sint8x2;

export type sint8x4 = TgpuVertexFormatData<'sint8x4'>;
export const sint8x4 = new TgpuVertexFormatDataImpl('sint8x4') as sint8x4;

export type unorm8x2 = TgpuVertexFormatData<'unorm8x2'>;
export const unorm8x2 = new TgpuVertexFormatDataImpl('unorm8x2') as unorm8x2;

export type unorm8x4 = TgpuVertexFormatData<'unorm8x4'>;
export const unorm8x4 = new TgpuVertexFormatDataImpl('unorm8x4') as unorm8x4;

export type snorm8x2 = TgpuVertexFormatData<'snorm8x2'>;
export const snorm8x2 = new TgpuVertexFormatDataImpl('snorm8x2') as snorm8x2;

export type snorm8x4 = TgpuVertexFormatData<'snorm8x4'>;
export const snorm8x4 = new TgpuVertexFormatDataImpl('snorm8x4') as snorm8x4;

export type uint16x2 = TgpuVertexFormatData<'uint16x2'>;
export const uint16x2 = new TgpuVertexFormatDataImpl('uint16x2') as uint16x2;

export type uint16x4 = TgpuVertexFormatData<'uint16x4'>;
export const uint16x4 = new TgpuVertexFormatDataImpl('uint16x4') as uint16x4;

export type sint16x2 = TgpuVertexFormatData<'sint16x2'>;
export const sint16x2 = new TgpuVertexFormatDataImpl('sint16x2') as sint16x2;

export type sint16x4 = TgpuVertexFormatData<'sint16x4'>;
export const sint16x4 = new TgpuVertexFormatDataImpl('sint16x4') as sint16x4;

export type unorm16x2 = TgpuVertexFormatData<'unorm16x2'>;
export const unorm16x2 = new TgpuVertexFormatDataImpl('unorm16x2') as unorm16x2;

export type unorm16x4 = TgpuVertexFormatData<'unorm16x4'>;
export const unorm16x4 = new TgpuVertexFormatDataImpl('unorm16x4') as unorm16x4;

export type snorm16x2 = TgpuVertexFormatData<'snorm16x2'>;
export const snorm16x2 = new TgpuVertexFormatDataImpl('snorm16x2') as snorm16x2;

export type snorm16x4 = TgpuVertexFormatData<'snorm16x4'>;
export const snorm16x4 = new TgpuVertexFormatDataImpl('snorm16x4') as snorm16x4;

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

export type PackedData =
  | uint8x2
  | uint8x4
  | sint8x2
  | sint8x4
  | unorm8x2
  | unorm8x4
  | snorm8x2
  | snorm8x4
  | uint16x2
  | uint16x4
  | sint16x2
  | sint16x4
  | unorm16x2
  | unorm16x4
  | snorm16x2
  | snorm16x4
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
  | unorm10_10_10_2;
