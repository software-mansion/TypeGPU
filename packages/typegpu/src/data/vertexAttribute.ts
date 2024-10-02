import type {
  IMeasurer,
  ISerialInput,
  ISerialOutput,
  MaxValue,
  Parsed,
} from 'typed-binary';
import { BufferReader, Measurer, Schema } from 'typed-binary';
import type { TgpuLooseData } from '../types';
import { f32, i32, u32 } from './numeric';
import {
  type Vec2f,
  type Vec2i,
  type Vec2u,
  type Vec3f,
  type Vec3i,
  type Vec3u,
  type Vec4f,
  type Vec4i,
  type Vec4u,
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

export interface TgpuVertexAttribute<T extends VertexFormat>
  extends TgpuLooseData<FormatToWGSLType<T>> {
  readonly format: T;
}

class TgpuVertexAttributeImpl<T extends VertexFormat>
  extends Schema<FormatToWGSLType<T>>
  implements TgpuVertexAttribute<T>
{
  private underlyingType: FormatToWGSLType<T>;
  private elementSize: 1 | 2 | 4;
  private elementCount: number;
  readonly isCustomAligned = false;
  readonly byteAlignment = 1;
  readonly isLoose = true;

  constructor(
    readonly size: number,
    readonly format: T,
  ) {
    super();
    this.underlyingType = formatToWGSLType[format];
    this.elementCount = this.underlyingType.size / 4;
    const elementSize = size / this.elementCount;
    if (elementSize !== 1 && elementSize !== 2 && elementSize !== 4) {
      throw new Error('Invalid element size');
    }
    this.elementSize = elementSize;
  }

  write(
    output: ISerialOutput,
    value: Parsed<typeof this.underlyingType>,
  ): void {
    if (typeof value === 'number') {
      // since the value is not a vector, we can just write it directly
      // (all single component attributes are 32-bit)
      switch (this.underlyingType) {
        case u32:
          output.writeUint32(value);
          break;
        case f32:
          output.writeFloat32(value);
          break;
        case i32:
          output.writeInt32(value);
          break;
        default:
          throw new Error('Invalid underlying type');
      }
      return;
    }
    writeSizedVector(output, value, this.elementSize);
  }

  read(input: ISerialInput): Parsed<typeof this.underlyingType> {
    const readBuffer = new ArrayBuffer(this.size);
    const readView = new DataView(readBuffer);
    for (let i = 0; i < this.size; i++) {
      readView.setUint8(i, input.readByte());
    }
    if (this.elementCount === 1) {
      switch (this.underlyingType) {
        case u32:
          return readView.getUint32(0) as Parsed<typeof this.underlyingType>;
        case f32:
          return readView.getFloat32(0) as Parsed<typeof this.underlyingType>;
        case i32:
          return readView.getInt32(0) as Parsed<typeof this.underlyingType>;
        default:
          throw new Error('Invalid underlying type');
      }
    }

    const vector = this.underlyingType as
      | Vec2u
      | Vec3u
      | Vec4u
      | Vec2f
      | Vec3f
      | Vec4f
      | Vec2i
      | Vec3i
      | Vec4i;
    const primitive =
      vectorKindToPrimitive[vector.label as keyof typeof vectorKindToPrimitive];

    const values = new Array(this.elementCount);
    for (let i = 0; i < this.elementCount; i++) {
      values[i] = readSizedPrimitive(
        primitive,
        this.elementSize,
        new BufferReader(readBuffer),
      );
    }

    switch (vector) {
      case vec2u:
      case vec2f:
      case vec2i:
        return vector(values[0], values[1]) as Parsed<
          typeof this.underlyingType
        >;
      case vec3u:
      case vec3f:
      case vec3i:
        return vector(values[0], values[1], values[2]) as Parsed<
          typeof this.underlyingType
        >;
      case vec4u:
      case vec4f:
      case vec4i:
        return vector(values[0], values[1], values[2], values[3]) as Parsed<
          typeof this.underlyingType
        >;
      default:
        throw new Error('Invalid underlying type');
    }
  }

  measure(
    _: Parsed<FormatToWGSLType<T>, Record<string, never>> | MaxValue,
    measurer: IMeasurer = new Measurer(),
  ): IMeasurer {
    return measurer.add(this.size);
  }
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

function writeSizedVector(
  output: ISerialOutput,
  value: vec2u | vec3u | vec4u | vec2f | vec3f | vec4f | vec2i | vec3i | vec4i,
  elementSize: 1 | 2 | 4,
): void {
  const primitive = vectorKindToPrimitive[value.kind];
  if (!primitive) throw new Error('Invalid vector kind');
  for (const entry of value) {
    writeSizedPrimitive(primitive, entry, elementSize, output);
  }
}

function writeSizedPrimitive(
  primitive: 'u32' | 'f32' | 'i32',
  value: number,
  size: 1 | 2 | 4,
  output: ISerialOutput,
): void {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const setters = {
    u32: [view.setUint8, view.setUint16, view.setUint32],
    // TODO: Implement logic for normalized floats
    f32: [null, null, view.setFloat32],
    i32: [view.setInt8, view.setInt16, view.setInt32],
  };
  const setter = setters[primitive][Math.log2(size)];
  if (setter) setter.call(view, 0, value);
  for (let i = 0; i < size; i++) {
    output.writeByte(view.getUint8(i));
  }
}

function readSizedPrimitive(
  primitive: 'u32' | 'f32' | 'i32',
  size: 1 | 2 | 4,
  input: ISerialInput,
): number {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  for (let i = 0; i < size; i++) {
    view.setUint8(i, input.readByte());
  }
  const getters = {
    u32: [view.getUint8, view.getUint16, view.getUint32],
    f32: [null, null, view.getFloat32],
    i32: [view.getInt8, view.getInt16, view.getInt32],
  };
  const getter = getters[primitive][Math.log2(size)];
  if (getter) return getter.call(view, 0);
  throw new Error('Invalid primitive');
}

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
  unorm10_10_10_2: vec4f,
} as const;

type VertexFormat =
  | 'uint8x2'
  | 'uint8x4'
  | 'sint8x2'
  | 'sint8x4'
  | 'unorm8x2'
  | 'unorm8x4'
  | 'snorm8x2'
  | 'snorm8x4'
  | 'uint16x2'
  | 'uint16x4'
  | 'sint16x2'
  | 'sint16x4'
  | 'unorm16x2'
  | 'unorm16x4'
  | 'snorm16x2'
  | 'snorm16x4'
  | 'float16x2'
  | 'float16x4'
  | 'float32'
  | 'float32x2'
  | 'float32x3'
  | 'float32x4'
  | 'uint32'
  | 'uint32x2'
  | 'uint32x3'
  | 'uint32x4'
  | 'sint32'
  | 'sint32x2'
  | 'sint32x3'
  | 'sint32x4'
  | 'unorm10_10_10_2';

type uint8x2 = TgpuVertexAttribute<'uint8x2'>;
export const uint8x2 = new TgpuVertexAttributeImpl(2, 'uint8x2') as uint8x2;

type uint8x4 = TgpuVertexAttribute<'uint8x4'>;
export const uint8x4 = new TgpuVertexAttributeImpl(4, 'uint8x4') as uint8x4;

type sint8x2 = TgpuVertexAttribute<'sint8x2'>;
export const sint8x2 = new TgpuVertexAttributeImpl(2, 'sint8x2') as sint8x2;

type sint8x4 = TgpuVertexAttribute<'sint8x4'>;
export const sint8x4 = new TgpuVertexAttributeImpl(4, 'sint8x4') as sint8x4;

type unorm8x2 = TgpuVertexAttribute<'unorm8x2'>;
export const unorm8x2 = new TgpuVertexAttributeImpl(2, 'unorm8x2') as unorm8x2;

type unorm8x4 = TgpuVertexAttribute<'unorm8x4'>;
export const unorm8x4 = new TgpuVertexAttributeImpl(4, 'unorm8x4') as unorm8x4;

type snorm8x2 = TgpuVertexAttribute<'snorm8x2'>;
export const snorm8x2 = new TgpuVertexAttributeImpl(2, 'snorm8x2') as snorm8x2;

type snorm8x4 = TgpuVertexAttribute<'snorm8x4'>;
export const snorm8x4 = new TgpuVertexAttributeImpl(4, 'snorm8x4') as snorm8x4;

type uint16x2 = TgpuVertexAttribute<'uint16x2'>;
export const uint16x2 = new TgpuVertexAttributeImpl(4, 'uint16x2') as uint16x2;

type uint16x4 = TgpuVertexAttribute<'uint16x4'>;
export const uint16x4 = new TgpuVertexAttributeImpl(8, 'uint16x4') as uint16x4;

type sint16x2 = TgpuVertexAttribute<'sint16x2'>;
export const sint16x2 = new TgpuVertexAttributeImpl(4, 'sint16x2') as sint16x2;

type sint16x4 = TgpuVertexAttribute<'sint16x4'>;
export const sint16x4 = new TgpuVertexAttributeImpl(8, 'sint16x4') as sint16x4;

type unorm16x2 = TgpuVertexAttribute<'unorm16x2'>;
export const unorm16x2 = new TgpuVertexAttributeImpl(
  4,
  'unorm16x2',
) as unorm16x2;

type unorm16x4 = TgpuVertexAttribute<'unorm16x4'>;
export const unorm16x4 = new TgpuVertexAttributeImpl(
  8,
  'unorm16x4',
) as unorm16x4;

type snorm16x2 = TgpuVertexAttribute<'snorm16x2'>;
export const snorm16x2 = new TgpuVertexAttributeImpl(
  4,
  'snorm16x2',
) as snorm16x2;

type snorm16x4 = TgpuVertexAttribute<'snorm16x4'>;
export const snorm16x4 = new TgpuVertexAttributeImpl(
  8,
  'snorm16x4',
) as snorm16x4;

type float16x2 = TgpuVertexAttribute<'float16x2'>;
export const float16x2 = new TgpuVertexAttributeImpl(
  4,
  'float16x2',
) as float16x2;

type float16x4 = TgpuVertexAttribute<'float16x4'>;
export const float16x4 = new TgpuVertexAttributeImpl(
  8,
  'float16x4',
) as float16x4;

type float32 = TgpuVertexAttribute<'float32'>;
export const float32 = new TgpuVertexAttributeImpl(4, 'float32') as float32;

type float32x2 = TgpuVertexAttribute<'float32x2'>;
export const float32x2 = new TgpuVertexAttributeImpl(
  8,
  'float32x2',
) as float32x2;

type float32x3 = TgpuVertexAttribute<'float32x3'>;
export const float32x3 = new TgpuVertexAttributeImpl(
  12,
  'float32x3',
) as float32x3;

type float32x4 = TgpuVertexAttribute<'float32x4'>;
export const float32x4 = new TgpuVertexAttributeImpl(
  16,
  'float32x4',
) as float32x4;

type uint32 = TgpuVertexAttribute<'uint32'>;
export const uint32 = new TgpuVertexAttributeImpl(4, 'uint32') as uint32;

type uint32x2 = TgpuVertexAttribute<'uint32x2'>;
export const uint32x2 = new TgpuVertexAttributeImpl(8, 'uint32x2') as uint32x2;

type uint32x3 = TgpuVertexAttribute<'uint32x3'>;
export const uint32x3 = new TgpuVertexAttributeImpl(12, 'uint32x3') as uint32x3;

type uint32x4 = TgpuVertexAttribute<'uint32x4'>;
export const uint32x4 = new TgpuVertexAttributeImpl(16, 'uint32x4') as uint32x4;

type sint32 = TgpuVertexAttribute<'sint32'>;
export const sint32 = new TgpuVertexAttributeImpl(4, 'sint32') as sint32;

type sint32x2 = TgpuVertexAttribute<'sint32x2'>;
export const sint32x2 = new TgpuVertexAttributeImpl(8, 'sint32x2') as sint32x2;

type sint32x3 = TgpuVertexAttribute<'sint32x3'>;
export const sint32x3 = new TgpuVertexAttributeImpl(12, 'sint32x3') as sint32x3;

type sint32x4 = TgpuVertexAttribute<'sint32x4'>;
export const sint32x4 = new TgpuVertexAttributeImpl(16, 'sint32x4') as sint32x4;

type unorm10_10_10_2 = TgpuVertexAttribute<'unorm10_10_10_2'>;
export const unorm10_10_10_2 = new TgpuVertexAttributeImpl(
  4,
  'unorm10_10_10_2',
) as unorm10_10_10_2;
