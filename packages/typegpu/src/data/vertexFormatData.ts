import {
  $cast,
  $gpuCallable,
  $internal,
  isMarkedInternal,
} from '../shared/symbols.ts';
import type { Infer } from '../shared/repr.ts';
import type {
  $invalidSchemaReason,
  $repr,
  $validVertexSchema,
} from '../shared/symbols.ts';
import type { VertexFormat } from '../shared/vertexFormat.ts';
import { f32, i32, u32 } from './numeric.ts';
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
} from './vector.ts';
import type { WithCast } from '../types.ts';
import {
  schemaCallWrapper,
  schemaCallWrapperGPU,
} from './schemaCallWrapper.ts';
import type { Snippet } from './snippet.ts';
import type {
  BaseData,
  F16,
  F32,
  I32,
  U32,
  Vec2f,
  Vec2h,
  Vec2i,
  Vec2u,
  Vec3f,
  Vec3h,
  Vec3i,
  Vec3u,
  Vec4f,
  Vec4h,
  Vec4i,
  Vec4u,
} from './wgslTypes.ts';

export type FormatToWGSLType<T extends VertexFormat> =
  (typeof formatToWGSLType)[T];

export interface TgpuVertexFormatData<T extends VertexFormat>
  extends BaseData, WithCast<FormatToWGSLType<T>> {
  readonly type: T;

  // Type-tokens, not available at runtime
  readonly [$repr]: Infer<FormatToWGSLType<T>>;
  readonly [$validVertexSchema]: true;
  readonly [$invalidSchemaReason]:
    'Vertex formats are not host-shareable, use concrete types instead';
  // ---
}

class TgpuVertexFormatDataImpl<T extends VertexFormat>
  implements TgpuVertexFormatData<T> {
  public readonly [$internal] = {};
  [$gpuCallable]: TgpuVertexFormatData<T>[typeof $gpuCallable];

  // Type-tokens, not available at runtime
  declare readonly [$repr]: Infer<FormatToWGSLType<T>>;
  declare readonly [$validVertexSchema]: true;
  declare readonly [$invalidSchemaReason]:
    'Vertex formats are not host-shareable, use concrete types instead';
  // ---

  constructor(public readonly type: T) {
    this[$gpuCallable] = {
      call: (ctx, [v]): Snippet => {
        return schemaCallWrapperGPU(ctx, formatToWGSLType[this.type], v);
      },
    };
  }

  [$cast](
    v?: Infer<FormatToWGSLType<T>>,
  ): Infer<FormatToWGSLType<T>> {
    return schemaCallWrapper(formatToWGSLType[this.type], v);
  }
}

export const formatToWGSLType = {
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
} as const;

export const packedFormats = new Set(Object.keys(formatToWGSLType));

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
  | unorm8x4_bgra;

export function isPackedData(value: unknown): value is PackedData {
  return (
    isMarkedInternal(value) && packedFormats.has((value as PackedData)?.type)
  );
}

type U32Data = U32 | Vec2u | Vec3u | Vec4u;
type I32Data = I32 | Vec2i | Vec3i | Vec4i;
type FloatData = F32 | Vec2f | Vec3f | Vec4f | F16 | Vec2h | Vec3h | Vec4h;

export type FormatToAcceptedData = {
  uint8: U32Data;
  uint8x2: U32Data;
  uint8x4: U32Data;
  sint8: I32Data;
  sint8x2: I32Data;
  sint8x4: I32Data;
  unorm8: FloatData;
  unorm8x2: FloatData;
  unorm8x4: FloatData;
  snorm8: FloatData;
  snorm8x2: FloatData;
  snorm8x4: FloatData;
  uint16: U32Data;
  uint16x2: U32Data;
  uint16x4: U32Data;
  sint16: I32Data;
  sint16x2: I32Data;
  sint16x4: I32Data;
  unorm16: FloatData;
  unorm16x2: FloatData;
  unorm16x4: FloatData;
  snorm16: FloatData;
  snorm16x2: FloatData;
  snorm16x4: FloatData;
  float16: FloatData;
  float16x2: FloatData;
  float16x4: FloatData;
  float32: FloatData;
  float32x2: FloatData;
  float32x3: FloatData;
  float32x4: FloatData;
  uint32: U32Data;
  uint32x2: U32Data;
  uint32x3: U32Data;
  uint32x4: U32Data;
  sint32: I32Data;
  sint32x2: I32Data;
  sint32x3: I32Data;
  sint32x4: I32Data;
  'unorm10-10-10-2': FloatData;
  'unorm8x4-bgra': FloatData;
};
