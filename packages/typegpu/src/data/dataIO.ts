import type { ISerialInput, ISerialOutput } from 'typed-binary';
import type { Infer, InferRecord } from '../shared/repr';
import alignIO from './alignIO';
import { alignmentOf } from './alignmentOf';
import { type LooseDecorated, getCustomAlignment } from './attributes';
import type { AnyData, LooseArray, LooseStruct } from './dataTypes';
import {
  mat2x2f as createMat2x2f,
  mat3x3f as createMat3x3f,
  mat4x4f as createMat4x4f,
} from './matrix';
import { sizeOf } from './sizeOf';
import {
  vec2f as createVec2f,
  vec2i as createVec2i,
  vec2u as createVec2u,
  vec3f as createVec3f,
  vec3i as createVec3i,
  vec3u as createVec3u,
  vec4f as createVec4f,
  vec4i as createVec4i,
  vec4u as createVec4u,
} from './vector';
import type {
  AnyWgslData,
  Atomic,
  BaseWgslData,
  Bool,
  Decorated,
  F32,
  I32,
  U32,
  WgslArray,
  WgslStruct,
  mat2x2f,
  mat3x3f,
  mat4x4f,
  vec2f,
  vec2i,
  vec2u,
  vec3f,
  vec3i,
  vec3u,
  vec4f,
  vec4i,
  vec4u,
} from './wgslTypes';

type CompleteDataWriters = {
  [TType in AnyData['type']]: (
    output: ISerialOutput,
    schema: Extract<AnyData, { readonly type: TType }>,
    value: Infer<Extract<AnyData, { readonly type: TType }>>,
  ) => void;
};

type CompleteDataReaders = {
  [TType in AnyData['type']]: (
    input: ISerialInput,
    schema: Extract<AnyData, { readonly type: TType }>,
  ) => Infer<Extract<AnyData, { readonly type: TType }>>;
};

function sint8Write(output: ISerialOutput, value: number) {
  if (value >= 0) {
    output.writeByte(value & 127);
  } else {
    output.writeByte((value & 127) | 128);
  }
}

function sint8Read(input: ISerialInput): number {
  const value = input.readByte();
  if (value & 128) {
    // has sign bit
    return (value & 127) - 128;
  }

  return value & 127;
}

const dataWriters = {
  bool(output, _schema: Bool, value: boolean) {
    output.writeBool(value);
  },

  f32(output, _schema: F32, value: number) {
    output.writeFloat32(value);
  },

  i32(output, _schema: I32, value: number) {
    output.writeInt32(value);
  },

  u32(output, _schema: U32, value: number) {
    output.writeUint32(value);
  },

  vec2f(output, _, value: vec2f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
  },

  vec2i(output, _, value: vec2i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
  },

  vec2u(output, _, value: vec2u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
  },

  vec3f(output, _, value: vec3f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
  },

  vec3i(output, _, value: vec3i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
  },

  vec3u(output, _, value: vec3u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
  },

  vec4f(output, _, value: vec4f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
    output.writeFloat32(value.w);
  },

  vec4i(output, _, value: vec4i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
    output.writeInt32(value.w);
  },

  vec4u(output, _, value: vec4u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
    output.writeUint32(value.w);
  },

  mat2x2f(output, _, value: mat2x2f) {
    for (let i = 0; i < value.length; ++i) {
      output.writeFloat32(value[i] as number);
    }
  },

  mat3x3f(output, _, value: mat3x3f) {
    for (let i = 0; i < value.length; ++i) {
      output.writeFloat32(value[i] as number);
    }
  },

  mat4x4f(output, _, value: mat4x4f) {
    for (let i = 0; i < value.length; ++i) {
      output.writeFloat32(value[i] as number);
    }
  },

  struct(
    output,
    schema: WgslStruct,
    value: InferRecord<Record<string, BaseWgslData>>,
  ) {
    const alignment = alignmentOf(schema);
    alignIO(output, alignment);

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(output, alignmentOf(property));
      writeData(output, property, value[key] as BaseWgslData);
    }

    alignIO(output, alignment);
  },

  array(output, schema: WgslArray, value: Infer<BaseWgslData>[]) {
    const alignment = alignmentOf(schema);
    alignIO(output, alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(schema.length, value.length); i++) {
      alignIO(output, alignment);
      const elementType = schema.elementType as AnyWgslData;
      // dataWriters[elementType?.type]?.(output, elementType, value[i]);
      writeData(output, elementType, value[i]);
    }
    output.seekTo(beginning + sizeOf(schema));
  },

  atomic(output, schema: Atomic, value: number) {
    dataWriters[schema.inner.type]?.(output, schema, value);
  },

  decorated(output, schema: Decorated, value: unknown) {
    const alignment = getCustomAlignment(schema) ?? 1;
    alignIO(output, alignment);

    const beginning = output.currentByteOffset;
    dataWriters[(schema.inner as AnyData)?.type]?.(output, schema.inner, value);
    output.seekTo(beginning + sizeOf(schema));
  },

  // Loose Types

  uint8x2(output, _, value: vec2u) {
    output.writeByte(value.x);
    output.writeByte(value.y);
  },
  uint8x4(output, _, value: vec4u) {
    output.writeByte(value.x);
    output.writeByte(value.y);
    output.writeByte(value.z);
    output.writeByte(value.w);
  },
  sint8x2(output, _, value: vec2i) {
    sint8Write(output, value.x);
    sint8Write(output, value.y);
  },
  sint8x4(output, _, value: vec4i) {
    sint8Write(output, value.x);
    sint8Write(output, value.y);
    sint8Write(output, value.z);
    sint8Write(output, value.w);
  },
  unorm8x2(output, _, value: vec2f) {
    output.writeByte(Math.floor(value.x * 255));
    output.writeByte(Math.floor(value.y * 255));
  },
  unorm8x4(output, _, value: vec4f) {
    output.writeByte(Math.floor(value.x * 255));
    output.writeByte(Math.floor(value.y * 255));
    output.writeByte(Math.floor(value.z * 255));
    output.writeByte(Math.floor(value.w * 255));
  },
  snorm8x2(output, _, value: vec2f) {
    output.writeByte(Math.floor(value.x * 127 + 128));
    output.writeByte(Math.floor(value.y * 127 + 128));
  },
  snorm8x4(output, _, value: vec4f) {
    output.writeByte(Math.floor(value.x * 127 + 128));
    output.writeByte(Math.floor(value.y * 127 + 128));
    output.writeByte(Math.floor(value.z * 127 + 128));
    output.writeByte(Math.floor(value.w * 127 + 128));
  },
  uint16x2(output, _, value: vec2u) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, value.x, littleEndian);
    view.setUint16(2, value.y, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  uint16x4(output, _, value: vec4u) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, value.x, littleEndian);
    view.setUint16(2, value.y, littleEndian);
    view.setUint16(4, value.z, littleEndian);
    view.setUint16(6, value.w, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  sint16x2(output, _, value: vec2i) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setInt16(0, value.x, littleEndian);
    view.setInt16(2, value.y, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  sint16x4(output, _, value: vec4i) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setInt16(0, value.x, littleEndian);
    view.setInt16(2, value.y, littleEndian);
    view.setInt16(4, value.z, littleEndian);
    view.setInt16(6, value.w, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  unorm16x2(output, _, value: vec2f) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 65535), littleEndian);
    view.setUint16(2, Math.floor(value.y * 65535), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  unorm16x4(output, _, value: vec4f) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 65535), littleEndian);
    view.setUint16(2, Math.floor(value.y * 65535), littleEndian);
    view.setUint16(4, Math.floor(value.z * 65535), littleEndian);
    view.setUint16(6, Math.floor(value.w * 65535), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  snorm16x2(output, _, value: vec2f) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 32767 + 32768), littleEndian);
    view.setUint16(2, Math.floor(value.y * 32767 + 32768), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  snorm16x4(output, _, value: vec4f) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 32767 + 32768), littleEndian);
    view.setUint16(2, Math.floor(value.y * 32767 + 32768), littleEndian);
    view.setUint16(4, Math.floor(value.z * 32767 + 32768), littleEndian);
    view.setUint16(6, Math.floor(value.w * 32767 + 32768), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  float16x2(output, _, value: vec2f) {
    output.writeFloat16(value.x);
    output.writeFloat16(value.y);
  },
  float16x4(output, _, value: vec4f) {
    output.writeFloat16(value.x);
    output.writeFloat16(value.y);
    output.writeFloat16(value.z);
    output.writeFloat16(value.w);
  },
  float32(output, _, value: number) {
    output.writeFloat32(value);
  },
  float32x2(output, _, value: vec2f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
  },
  float32x3(output, _, value: vec3f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
  },
  float32x4(output, _, value: vec4f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
    output.writeFloat32(value.w);
  },
  uint32(output, _, value: number) {
    output.writeUint32(value);
  },
  uint32x2(output, _, value: vec2u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
  },
  uint32x3(output, _, value: vec3u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
  },
  uint32x4(output, _, value: vec4u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
    output.writeUint32(value.w);
  },
  sint32(output, _, value: number) {
    output.writeInt32(value);
  },
  sint32x2(output, _, value: vec2i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
  },
  sint32x3(output, _, value: vec3i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
  },
  sint32x4(output, _, value: vec4i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
    output.writeInt32(value.w);
  },
  'unorm10-10-10-2'(output, _, value: vec4f) {
    let packed = 0;
    packed |= ((value.x * 1023) & 1023) << 22; // r (10 bits)
    packed |= ((value.x * 1023) & 1023) << 12; // g (10 bits)
    packed |= ((value.y * 1023) & 1023) << 2; // b (10 bits)
    packed |= (value.z * 3) & 3; // a (2 bits)
    output.writeUint32(packed);
  },

  'loose-array'(output, schema: LooseArray, value: unknown[]) {
    const alignment = alignmentOf(schema);

    alignIO(output, alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(schema.length, value.length); i++) {
      alignIO(output, alignment);
      dataWriters[(schema.elementType as AnyData)?.type]?.(
        output,
        schema.elementType,
        value[i],
      );
    }

    output.seekTo(beginning + sizeOf(schema));
  },

  'loose-struct'(output, schema: LooseStruct, value) {
    for (const [key, property] of Object.entries(schema.propTypes)) {
      dataWriters[property.type]?.(output, property, value[key]);
    }
  },

  'loose-decorated'(output, schema: LooseDecorated, value: unknown) {
    const alignment = getCustomAlignment(schema) ?? 1;
    alignIO(output, alignment);

    const beginning = output.currentByteOffset;
    const writer = dataWriters[(schema.inner as AnyData)?.type];
    writer?.(output, schema.inner, value);
    output.seekTo(beginning + sizeOf(schema));
    return value;
  },
} satisfies CompleteDataWriters as Record<
  string,
  (output: ISerialOutput, schema: unknown, value: unknown) => void
>;

export function writeData<TData extends BaseWgslData>(
  output: ISerialOutput,
  schema: TData,
  value: Infer<TData>,
): void {
  const writer = dataWriters[schema.type];
  if (!writer) {
    throw new Error(`Cannot write data of type '${schema.type}'.`);
  }

  writer(output, schema, value);
}

const dataReaders = {
  bool(input: ISerialInput) {
    return input.readBool();
  },

  f32(input: ISerialInput) {
    return input.readFloat32();
  },

  i32(input: ISerialInput) {
    return input.readInt32();
  },

  u32(input: ISerialInput) {
    return input.readUint32();
  },

  vec2f(input) {
    return createVec2f(input.readFloat32(), input.readFloat32());
  },

  vec3f(input: ISerialInput) {
    return createVec3f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  vec4f(input: ISerialInput) {
    return createVec4f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  vec2i(input) {
    return createVec2i(input.readInt32(), input.readInt32());
  },

  vec3i(input: ISerialInput) {
    return createVec3i(input.readInt32(), input.readInt32(), input.readInt32());
  },

  vec4i(input: ISerialInput) {
    return createVec4i(
      input.readInt32(),
      input.readInt32(),
      input.readInt32(),
      input.readInt32(),
    );
  },

  vec2u(input) {
    return createVec2u(input.readUint32(), input.readUint32());
  },

  vec3u(input: ISerialInput) {
    return createVec3u(
      input.readUint32(),
      input.readUint32(),
      input.readUint32(),
    );
  },

  vec4u(input: ISerialInput) {
    return createVec4u(
      input.readUint32(),
      input.readUint32(),
      input.readUint32(),
      input.readUint32(),
    );
  },

  mat2x2f(input: ISerialInput) {
    return createMat2x2f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  mat3x3f(input: ISerialInput) {
    return createMat3x3f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      //
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      //
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  mat4x4f(input: ISerialInput) {
    return createMat4x4f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      //
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      //
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      //
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  struct(input: ISerialInput, schema: WgslStruct) {
    const alignment = alignmentOf(schema);
    alignIO(input, alignment);
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(input, alignmentOf(property));
      result[key] = readData(input, property);
    }

    alignIO(input, alignment);
    return result as InferRecord<Record<string, BaseWgslData>>;
  },

  array(input, schema) {
    const alignment = alignmentOf(schema);
    const elements: unknown[] = [];

    for (let i = 0; i < schema.length; i++) {
      alignIO(input, alignment);
      const elementType = schema.elementType as AnyWgslData;
      const value = readData(input, elementType);
      elements.push(value);
    }

    alignIO(input, alignment);
    return elements as never[];
  },

  atomic(input, schema: Atomic): number {
    return readData(input, schema.inner);
  },

  decorated(input, schema: Decorated) {
    const alignment = getCustomAlignment(schema) ?? 1;
    alignIO(input, alignment);

    const beginning = input.currentByteOffset;
    const value = readData(input, schema.inner);
    input.seekTo(beginning + sizeOf(schema));
    return value as never;
  },

  // Loose Types

  uint8x2: (i) => createVec2u(i.readByte(), i.readByte()),
  uint8x4: (i) =>
    createVec4u(i.readByte(), i.readByte(), i.readByte(), i.readByte()),
  sint8x2: (i) => {
    return createVec2i(sint8Read(i), sint8Read(i));
  },
  sint8x4: (i) =>
    createVec4i(sint8Read(i), sint8Read(i), sint8Read(i), sint8Read(i)),
  unorm8x2: (i) => createVec2f(i.readByte() / 255, i.readByte() / 255),
  unorm8x4: (i) =>
    createVec4f(
      i.readByte() / 255,
      i.readByte() / 255,
      i.readByte() / 255,
      i.readByte() / 255,
    ),
  snorm8x2: (i) =>
    createVec2f((i.readByte() - 128) / 127, (i.readByte() - 128) / 127),
  snorm8x4: (i) =>
    createVec4f(
      (i.readByte() - 128) / 127,
      (i.readByte() - 128) / 127,
      (i.readByte() - 128) / 127,
      (i.readByte() - 128) / 127,
    ),
  uint16x2(i) {
    const buffer = new ArrayBuffer(4);
    i.readSlice(new Uint8Array(buffer), 0, 4);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec2u(
      view.getUint16(0, littleEndian),
      view.getUint16(2, littleEndian),
    );
  },
  uint16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec4u(
      view.getUint16(0, littleEndian),
      view.getUint16(2, littleEndian),
      view.getUint16(4, littleEndian),
      view.getUint16(6, littleEndian),
    );
  },
  sint16x2(i) {
    const buffer = new ArrayBuffer(4);
    i.readSlice(new Uint8Array(buffer), 0, 4);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec2i(
      view.getInt16(0, littleEndian),
      view.getInt16(2, littleEndian),
    );
  },
  sint16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec4i(
      view.getInt16(0, littleEndian),
      view.getInt16(2, littleEndian),
      view.getInt16(4, littleEndian),
      view.getInt16(6, littleEndian),
    );
  },
  unorm16x2(i) {
    const buffer = new ArrayBuffer(4);
    i.readSlice(new Uint8Array(buffer), 0, 4);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec2f(
      view.getUint16(0, littleEndian) / 65535,
      view.getUint16(2, littleEndian) / 65535,
    );
  },
  unorm16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec4f(
      view.getUint16(0, littleEndian) / 65535,
      view.getUint16(2, littleEndian) / 65535,
      view.getUint16(4, littleEndian) / 65535,
      view.getUint16(6, littleEndian) / 65535,
    );
  },
  snorm16x2(i) {
    const buffer = new ArrayBuffer(4);
    i.readSlice(new Uint8Array(buffer), 0, 4);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec2f(
      (view.getUint16(0, littleEndian) - 32768) / 32767,
      (view.getUint16(2, littleEndian) - 32768) / 32767,
    );
  },
  snorm16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return createVec4f(
      (view.getUint16(0, littleEndian) - 32768) / 32767,
      (view.getUint16(2, littleEndian) - 32768) / 32767,
      (view.getUint16(4, littleEndian) - 32768) / 32767,
      (view.getUint16(6, littleEndian) - 32768) / 32767,
    );
  },
  float16x2: (i) => createVec2f(i.readFloat16(), i.readFloat16()),
  float16x4: (i) =>
    createVec4f(
      i.readFloat16(),
      i.readFloat16(),
      i.readFloat16(),
      i.readFloat16(),
    ),
  float32: (i) => i.readFloat32(),
  float32x2: (i) => createVec2f(i.readFloat32(), i.readFloat32()),
  float32x3: (i) =>
    createVec3f(i.readFloat32(), i.readFloat32(), i.readFloat32()),
  float32x4: (i) =>
    createVec4f(
      i.readFloat32(),
      i.readFloat32(),
      i.readFloat32(),
      i.readFloat32(),
    ),
  uint32: (i) => i.readUint32(),
  uint32x2: (i) => createVec2u(i.readUint32(), i.readUint32()),
  uint32x3: (i) => createVec3u(i.readUint32(), i.readUint32(), i.readUint32()),
  uint32x4: (i) =>
    createVec4u(i.readUint32(), i.readUint32(), i.readUint32(), i.readUint32()),
  sint32: (i) => i.readInt32(),
  sint32x2: (i) => createVec2i(i.readInt32(), i.readInt32()),
  sint32x3: (i) => createVec3i(i.readInt32(), i.readInt32(), i.readInt32()),
  sint32x4: (i) =>
    createVec4i(i.readInt32(), i.readInt32(), i.readInt32(), i.readInt32()),
  'unorm10-10-10-2'(i) {
    const packed = i.readUint32();
    const r = (packed >> 22) / 1023;
    const g = ((packed >> 12) & 1023) / 1023;
    const b = ((packed >> 2) & 1023) / 1023;
    const a = (packed & 3) / 3;
    return createVec4f(r, g, b, a);
  },

  'loose-struct'(input, schema: LooseStruct) {
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(schema.propTypes)) {
      result[key] = readData(input, property);
    }

    return result as InferRecord<Record<string, BaseWgslData>>;
  },

  'loose-array'(input, schema: LooseArray) {
    const alignment = alignmentOf(schema);
    const elements: unknown[] = [];

    for (let i = 0; i < schema.length; i++) {
      alignIO(input, alignment);
      elements.push(readData(input, schema.elementType));
    }

    alignIO(input, alignment);
    return elements;
  },

  'loose-decorated'(input, schema: LooseDecorated) {
    alignIO(input, getCustomAlignment(schema) ?? 1);

    const beginning = input.currentByteOffset;
    const value = readData(input, schema.inner);
    input.seekTo(beginning + sizeOf(schema));
    return value;
  },
} satisfies CompleteDataReaders as Record<
  string,
  (input: ISerialInput, schema: unknown) => unknown
>;

export function readData<TData extends BaseWgslData>(
  input: ISerialInput,
  schema: TData,
): Infer<TData> {
  const reader = dataReaders[schema.type];
  if (!reader) {
    throw new Error(`Cannot read data of type '${schema.type}'.`);
  }

  return reader(input, schema) as Infer<TData>;
}
