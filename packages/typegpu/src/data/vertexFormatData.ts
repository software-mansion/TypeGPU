import type {
  IMeasurer,
  ISerialInput,
  ISerialOutput,
  MaxValue,
  Parsed,
} from 'typed-binary';
import { BufferReader, Measurer } from 'typed-binary';
import type { Infer } from '../shared/repr';
import type { VertexFormat } from '../shared/vertexFormat';
import { f32, i32, u32 } from './numeric';
import {
  type Vec2fConstructor,
  type Vec2iConstructor,
  type Vec2uConstructor,
  type Vec3fConstructor,
  type Vec3iConstructor,
  type Vec3uConstructor,
  type Vec4fConstructor,
  type Vec4iConstructor,
  type Vec4uConstructor,
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
  sizeOfData,
  type vec2f as vec2fType,
  type vec2i as vec2iType,
  type vec2u as vec2uType,
  type vec3f as vec3fType,
  type vec3i as vec3iType,
  type vec3u as vec3uType,
  type vec4f as vec4fType,
  type vec4i as vec4iType,
  type vec4u as vec4uType,
} from './wgslTypes';

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

  private readonly _wgslType: FormatToWGSLType<T>;
  private elementSize: 1 | 2 | 4;
  private elementCount: number;
  private isSigned: boolean;
  readonly byteAlignment = 1;
  readonly isLoose = true;

  constructor(
    public readonly size: number,
    public readonly type: T,
  ) {
    this._wgslType = formatToWGSLType[type];
    this.isSigned = normalizedToIsSigned[type] ?? false;
    this.elementCount = sizeOfData(this._wgslType) / 4;
    const elementSize = size / this.elementCount;
    if (elementSize !== 1 && elementSize !== 2 && elementSize !== 4) {
      throw new Error('Invalid element size');
    }
    this.elementSize = elementSize;
  }

  write(output: ISerialOutput, value: Parsed<typeof this.__repr>): void {
    if (typeof value === 'number') {
      // since the value is not a vector, we can just write it directly
      // (all single component attributes are 32-bit)
      switch (this.__repr) {
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
    writeSizedVector(output, value, this.elementSize, this.isSigned);
  }

  read(input: ISerialInput): Parsed<typeof this.__repr> {
    const readBuffer = new ArrayBuffer(this.size);
    const readView = new DataView(readBuffer);
    for (let i = 0; i < this.size; i++) {
      readView.setUint8(i, input.readByte());
    }
    if (this.elementCount === 1) {
      switch (this.__repr) {
        case u32:
          return readView.getUint32(0) as Parsed<typeof this.__repr>;
        case f32:
          return readView.getFloat32(0) as Parsed<typeof this.__repr>;
        case i32:
          return readView.getInt32(0) as Parsed<typeof this.__repr>;
        default:
          throw new Error('Invalid underlying type');
      }
    }

    const vector = this._wgslType as
      | (Vec2u & Vec2uConstructor)
      | (Vec3u & Vec3uConstructor)
      | (Vec4u & Vec4uConstructor)
      | (Vec2f & Vec2fConstructor)
      | (Vec3f & Vec3fConstructor)
      | (Vec4f & Vec4fConstructor)
      | (Vec2i & Vec2iConstructor)
      | (Vec3i & Vec3iConstructor)
      | (Vec4i & Vec4iConstructor);

    const primitive =
      vectorKindToPrimitive[vector.type as keyof typeof vectorKindToPrimitive];

    const values = new Array(this.elementCount);
    const reader = new BufferReader(readBuffer);
    for (let i = 0; i < this.elementCount; i++) {
      values[i] = readSizedPrimitive(
        primitive,
        this.elementSize,
        reader,
        this.isSigned,
      );
    }

    switch (vector) {
      case vec2u:
      case vec2f:
      case vec2i:
        return vector(values[0], values[1]) as Parsed<typeof this.__repr>;
      case vec3u:
      case vec3f:
      case vec3i:
        return vector(values[0], values[1], values[2]) as Parsed<
          typeof this.__repr
        >;
      case vec4u:
      case vec4f:
      case vec4i:
        return vector(values[0], values[1], values[2], values[3]) as Parsed<
          typeof this.__repr
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
  value:
    | vec2uType
    | vec3uType
    | vec4uType
    | vec2fType
    | vec3fType
    | vec4fType
    | vec2iType
    | vec3iType
    | vec4iType,
  elementSize: 1 | 2 | 4,
  isSigned: boolean,
): void {
  const primitive = vectorKindToPrimitive[value.kind];
  for (let i = 0; i < value.length; ++i) {
    const entry = value[i] as number;
    writeSizedPrimitive(primitive, entry, elementSize, output, isSigned);
  }
}

function writeSizedPrimitive(
  primitive: 'u32' | 'f32' | 'i32',
  value: number,
  size: 1 | 2 | 4,
  output: ISerialOutput,
  floatSigned = true,
): void {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);

  const writef8 = (offset: number, value: number) => {
    const asInt = floatSigned ? value * 127 + 128 : value * 255;
    view.setUint8(offset, Math.floor(asInt));
  };
  const writef16 = (offset: number, value: number) => {
    const asInt = floatSigned ? value * 32767 + 32768 : value * 65535;
    view.setUint16(offset, Math.floor(asInt));
  };

  const setters = {
    u32: [view.setUint8, view.setUint16, view.setUint32],
    f32: [writef8, writef16, view.setFloat32],
    i32: [view.setInt8, view.setInt16, view.setInt32],
  };

  const setter = setters[primitive][Math.log2(size)];
  if (setter) {
    setter.call(view, 0, value);
  }
  for (let i = 0; i < size; i++) {
    output.writeByte(view.getUint8(i));
  }
}

function readSizedPrimitive(
  primitive: 'u32' | 'f32' | 'i32',
  size: 1 | 2 | 4,
  input: ISerialInput,
  floatSigned = true,
): number {
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  for (let i = 0; i < size; i++) {
    view.setUint8(i, input.readByte());
  }

  const readf8 = (offset: number) => {
    const asInt = view.getUint8(offset);
    return floatSigned ? (asInt - 128) / 127 : asInt / 255;
  };
  const readf16 = (offset: number) => {
    const asInt = view.getUint16(offset);
    return floatSigned ? (asInt - 32768) / 32767 : asInt / 65535;
  };

  const getters = {
    u32: [view.getUint8, view.getUint16, view.getUint32],
    f32: [readf8, readf16, view.getFloat32],
    i32: [view.getInt8, view.getInt16, view.getInt32],
  };

  const getter = getters[primitive][Math.log2(size)];
  if (getter) {
    return getter.call(view, 0);
  }
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
  'unorm10-10-10-2': vec4f,
} as const;

const normalizedToIsSigned = {
  unorm8x2: false,
  unorm8x4: false,
  snorm8x2: true,
  snorm8x4: true,
  unorm16x2: false,
  unorm16x4: false,
  snorm16x2: true,
  snorm16x4: true,
  float16x2: true,
  float16x4: true,
  'unorm10-10-10-2': false,
} as Record<VertexFormat, boolean | undefined>;

export type uint8x2 = TgpuVertexFormatData<'uint8x2'>;
export const uint8x2 = new TgpuVertexFormatDataImpl(2, 'uint8x2') as uint8x2;

export type uint8x4 = TgpuVertexFormatData<'uint8x4'>;
export const uint8x4 = new TgpuVertexFormatDataImpl(4, 'uint8x4') as uint8x4;

export type sint8x2 = TgpuVertexFormatData<'sint8x2'>;
export const sint8x2 = new TgpuVertexFormatDataImpl(2, 'sint8x2') as sint8x2;

export type sint8x4 = TgpuVertexFormatData<'sint8x4'>;
export const sint8x4 = new TgpuVertexFormatDataImpl(4, 'sint8x4') as sint8x4;

export type unorm8x2 = TgpuVertexFormatData<'unorm8x2'>;
export const unorm8x2 = new TgpuVertexFormatDataImpl(2, 'unorm8x2') as unorm8x2;

export type unorm8x4 = TgpuVertexFormatData<'unorm8x4'>;
export const unorm8x4 = new TgpuVertexFormatDataImpl(4, 'unorm8x4') as unorm8x4;

export type snorm8x2 = TgpuVertexFormatData<'snorm8x2'>;
export const snorm8x2 = new TgpuVertexFormatDataImpl(2, 'snorm8x2') as snorm8x2;

export type snorm8x4 = TgpuVertexFormatData<'snorm8x4'>;
export const snorm8x4 = new TgpuVertexFormatDataImpl(4, 'snorm8x4') as snorm8x4;

export type uint16x2 = TgpuVertexFormatData<'uint16x2'>;
export const uint16x2 = new TgpuVertexFormatDataImpl(4, 'uint16x2') as uint16x2;

export type uint16x4 = TgpuVertexFormatData<'uint16x4'>;
export const uint16x4 = new TgpuVertexFormatDataImpl(8, 'uint16x4') as uint16x4;

export type sint16x2 = TgpuVertexFormatData<'sint16x2'>;
export const sint16x2 = new TgpuVertexFormatDataImpl(4, 'sint16x2') as sint16x2;

export type sint16x4 = TgpuVertexFormatData<'sint16x4'>;
export const sint16x4 = new TgpuVertexFormatDataImpl(8, 'sint16x4') as sint16x4;

export type unorm16x2 = TgpuVertexFormatData<'unorm16x2'>;
export const unorm16x2 = new TgpuVertexFormatDataImpl(
  4,
  'unorm16x2',
) as unorm16x2;

export type unorm16x4 = TgpuVertexFormatData<'unorm16x4'>;
export const unorm16x4 = new TgpuVertexFormatDataImpl(
  8,
  'unorm16x4',
) as unorm16x4;

export type snorm16x2 = TgpuVertexFormatData<'snorm16x2'>;
export const snorm16x2 = new TgpuVertexFormatDataImpl(
  4,
  'snorm16x2',
) as snorm16x2;

export type snorm16x4 = TgpuVertexFormatData<'snorm16x4'>;
export const snorm16x4 = new TgpuVertexFormatDataImpl(
  8,
  'snorm16x4',
) as snorm16x4;

export type float16x2 = TgpuVertexFormatData<'float16x2'>;
export const float16x2 = new TgpuVertexFormatDataImpl(
  4,
  'float16x2',
) as float16x2;

export type float16x4 = TgpuVertexFormatData<'float16x4'>;
export const float16x4 = new TgpuVertexFormatDataImpl(
  8,
  'float16x4',
) as float16x4;

export type float32 = TgpuVertexFormatData<'float32'>;
export const float32 = new TgpuVertexFormatDataImpl(4, 'float32') as float32;

export type float32x2 = TgpuVertexFormatData<'float32x2'>;
export const float32x2 = new TgpuVertexFormatDataImpl(
  8,
  'float32x2',
) as float32x2;

export type float32x3 = TgpuVertexFormatData<'float32x3'>;
export const float32x3 = new TgpuVertexFormatDataImpl(
  12,
  'float32x3',
) as float32x3;

export type float32x4 = TgpuVertexFormatData<'float32x4'>;
export const float32x4 = new TgpuVertexFormatDataImpl(
  16,
  'float32x4',
) as float32x4;

export type uint32 = TgpuVertexFormatData<'uint32'>;
export const uint32 = new TgpuVertexFormatDataImpl(4, 'uint32') as uint32;

export type uint32x2 = TgpuVertexFormatData<'uint32x2'>;
export const uint32x2 = new TgpuVertexFormatDataImpl(8, 'uint32x2') as uint32x2;

export type uint32x3 = TgpuVertexFormatData<'uint32x3'>;
export const uint32x3 = new TgpuVertexFormatDataImpl(
  12,
  'uint32x3',
) as uint32x3;

export type uint32x4 = TgpuVertexFormatData<'uint32x4'>;
export const uint32x4 = new TgpuVertexFormatDataImpl(
  16,
  'uint32x4',
) as uint32x4;

export type sint32 = TgpuVertexFormatData<'sint32'>;
export const sint32 = new TgpuVertexFormatDataImpl(4, 'sint32') as sint32;

export type sint32x2 = TgpuVertexFormatData<'sint32x2'>;
export const sint32x2 = new TgpuVertexFormatDataImpl(8, 'sint32x2') as sint32x2;

export type sint32x3 = TgpuVertexFormatData<'sint32x3'>;
export const sint32x3 = new TgpuVertexFormatDataImpl(
  12,
  'sint32x3',
) as sint32x3;

export type sint32x4 = TgpuVertexFormatData<'sint32x4'>;
export const sint32x4 = new TgpuVertexFormatDataImpl(
  16,
  'sint32x4',
) as sint32x4;

export type unorm10_10_10_2 = TgpuVertexFormatData<'unorm10-10-10-2'>;
export const unorm10_10_10_2 = new TgpuVertexFormatDataImpl(
  4,
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
