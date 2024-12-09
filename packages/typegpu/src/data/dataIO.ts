import type { ISerialInput, ISerialOutput } from 'typed-binary';
import type { Infer, InferRecord } from '../shared/repr';
import alignIO from './alignIO';
import { alignmentOf, customAlignmentOf } from './alignmentOf';
import type {
  AnyData,
  LooseArray,
  LooseDecorated,
  LooseStruct,
} from './dataTypes';
import { mat2x2f, mat3x3f, mat4x4f } from './matrix';
import { sizeOf } from './sizeOf';
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
import type * as wgsl from './wgslTypes';

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
  bool(output, _schema: wgsl.Bool, value: boolean) {
    output.writeBool(value);
  },

  f32(output, _schema: wgsl.F32, value: number) {
    output.writeFloat32(value);
  },

  f16(output, _schema: wgsl.F16, value: number) {
    output.writeFloat16(value);
  },

  i32(output, _schema: wgsl.I32, value: number) {
    output.writeInt32(value);
  },

  u32(output, _schema: wgsl.U32, value: number) {
    output.writeUint32(value);
  },

  vec2f(output, _, value: wgsl.v2f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
  },

  vec2i(output, _, value: wgsl.v2i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
  },

  vec2u(output, _, value: wgsl.v2u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
  },

  vec3f(output, _, value: wgsl.v3f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
  },

  vec3i(output, _, value: wgsl.v3i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
  },

  vec3u(output, _, value: wgsl.v3u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
  },

  vec4f(output, _, value: wgsl.v4f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
    output.writeFloat32(value.w);
  },

  vec4i(output, _, value: wgsl.v4i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
    output.writeInt32(value.w);
  },

  vec4u(output, _, value: wgsl.v4u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
    output.writeUint32(value.w);
  },

  mat2x2f(output, _, value: wgsl.m2x2f) {
    for (let i = 0; i < value.length; ++i) {
      output.writeFloat32(value[i] as number);
    }
  },

  mat3x3f(output, _, value: wgsl.m3x3f) {
    for (let i = 0; i < value.length; ++i) {
      output.writeFloat32(value[i] as number);
    }
  },

  mat4x4f(output, _, value: wgsl.m4x4f) {
    for (let i = 0; i < value.length; ++i) {
      output.writeFloat32(value[i] as number);
    }
  },

  struct(
    output,
    schema: wgsl.WgslStruct,
    value: InferRecord<Record<string, wgsl.BaseWgslData>>,
  ) {
    const alignment = alignmentOf(schema);
    alignIO(output, alignment);

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(output, alignmentOf(property));
      writeData(output, property, value[key] as wgsl.BaseWgslData);
    }

    alignIO(output, alignment);
  },

  array(output, schema: wgsl.WgslArray, value: Infer<wgsl.BaseWgslData>[]) {
    if (schema.length === 0) {
      throw new Error('Cannot write using a runtime-sized schema.');
    }

    const alignment = alignmentOf(schema);
    alignIO(output, alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(schema.length, value.length); i++) {
      alignIO(output, alignment);
      writeData(output, schema.elementType, value[i]);
    }
    output.seekTo(beginning + sizeOf(schema));
  },

  atomic(output, schema: wgsl.Atomic, value: number) {
    dataWriters[schema.inner.type]?.(output, schema, value);
  },

  decorated(output, schema: wgsl.Decorated, value: unknown) {
    const alignment = customAlignmentOf(schema);
    alignIO(output, alignment);

    const beginning = output.currentByteOffset;
    dataWriters[(schema.inner as AnyData)?.type]?.(output, schema.inner, value);
    output.seekTo(beginning + sizeOf(schema));
  },

  // Loose Types

  uint8x2(output, _, value: wgsl.v2u) {
    output.writeByte(value.x);
    output.writeByte(value.y);
  },
  uint8x4(output, _, value: wgsl.v4u) {
    output.writeByte(value.x);
    output.writeByte(value.y);
    output.writeByte(value.z);
    output.writeByte(value.w);
  },
  sint8x2(output, _, value: wgsl.v2i) {
    sint8Write(output, value.x);
    sint8Write(output, value.y);
  },
  sint8x4(output, _, value: wgsl.v4i) {
    sint8Write(output, value.x);
    sint8Write(output, value.y);
    sint8Write(output, value.z);
    sint8Write(output, value.w);
  },
  unorm8x2(output, _, value: wgsl.v2f) {
    output.writeByte(Math.floor(value.x * 255));
    output.writeByte(Math.floor(value.y * 255));
  },
  unorm8x4(output, _, value: wgsl.v4f) {
    output.writeByte(Math.floor(value.x * 255));
    output.writeByte(Math.floor(value.y * 255));
    output.writeByte(Math.floor(value.z * 255));
    output.writeByte(Math.floor(value.w * 255));
  },
  snorm8x2(output, _, value: wgsl.v2f) {
    output.writeByte(Math.floor(value.x * 127 + 128));
    output.writeByte(Math.floor(value.y * 127 + 128));
  },
  snorm8x4(output, _, value: wgsl.v4f) {
    output.writeByte(Math.floor(value.x * 127 + 128));
    output.writeByte(Math.floor(value.y * 127 + 128));
    output.writeByte(Math.floor(value.z * 127 + 128));
    output.writeByte(Math.floor(value.w * 127 + 128));
  },
  uint16x2(output, _, value: wgsl.v2u) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, value.x, littleEndian);
    view.setUint16(2, value.y, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  uint16x4(output, _, value: wgsl.v4u) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, value.x, littleEndian);
    view.setUint16(2, value.y, littleEndian);
    view.setUint16(4, value.z, littleEndian);
    view.setUint16(6, value.w, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  sint16x2(output, _, value: wgsl.v2i) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setInt16(0, value.x, littleEndian);
    view.setInt16(2, value.y, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  sint16x4(output, _, value: wgsl.v4i) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setInt16(0, value.x, littleEndian);
    view.setInt16(2, value.y, littleEndian);
    view.setInt16(4, value.z, littleEndian);
    view.setInt16(6, value.w, littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  unorm16x2(output, _, value: wgsl.v2f) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 65535), littleEndian);
    view.setUint16(2, Math.floor(value.y * 65535), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  unorm16x4(output, _, value: wgsl.v4f) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 65535), littleEndian);
    view.setUint16(2, Math.floor(value.y * 65535), littleEndian);
    view.setUint16(4, Math.floor(value.z * 65535), littleEndian);
    view.setUint16(6, Math.floor(value.w * 65535), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  snorm16x2(output, _, value: wgsl.v2f) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 32767 + 32768), littleEndian);
    view.setUint16(2, Math.floor(value.y * 32767 + 32768), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  snorm16x4(output, _, value: wgsl.v4f) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 32767 + 32768), littleEndian);
    view.setUint16(2, Math.floor(value.y * 32767 + 32768), littleEndian);
    view.setUint16(4, Math.floor(value.z * 32767 + 32768), littleEndian);
    view.setUint16(6, Math.floor(value.w * 32767 + 32768), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  float16x2(output, _, value: wgsl.v2f) {
    output.writeFloat16(value.x);
    output.writeFloat16(value.y);
  },
  float16x4(output, _, value: wgsl.v4f) {
    output.writeFloat16(value.x);
    output.writeFloat16(value.y);
    output.writeFloat16(value.z);
    output.writeFloat16(value.w);
  },
  float32(output, _, value: number) {
    output.writeFloat32(value);
  },
  float32x2(output, _, value: wgsl.v2f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
  },
  float32x3(output, _, value: wgsl.v3f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
  },
  float32x4(output, _, value: wgsl.v4f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
    output.writeFloat32(value.w);
  },
  uint32(output, _, value: number) {
    output.writeUint32(value);
  },
  uint32x2(output, _, value: wgsl.v2u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
  },
  uint32x3(output, _, value: wgsl.v3u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
  },
  uint32x4(output, _, value: wgsl.v4u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
    output.writeUint32(value.z);
    output.writeUint32(value.w);
  },
  sint32(output, _, value: number) {
    output.writeInt32(value);
  },
  sint32x2(output, _, value: wgsl.v2i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
  },
  sint32x3(output, _, value: wgsl.v3i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
  },
  sint32x4(output, _, value: wgsl.v4i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
    output.writeInt32(value.z);
    output.writeInt32(value.w);
  },
  'unorm10-10-10-2'(output, _, value: wgsl.v4f) {
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
    const alignment = customAlignmentOf(schema);
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

export function writeData<TData extends wgsl.BaseWgslData>(
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

  f16(input: ISerialInput) {
    return input.readFloat16();
  },

  i32(input: ISerialInput) {
    return input.readInt32();
  },

  u32(input: ISerialInput) {
    return input.readUint32();
  },

  vec2f(input) {
    return vec2f(input.readFloat32(), input.readFloat32());
  },

  vec3f(input: ISerialInput) {
    return vec3f(input.readFloat32(), input.readFloat32(), input.readFloat32());
  },

  vec4f(input: ISerialInput) {
    return vec4f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  vec2i(input) {
    return vec2i(input.readInt32(), input.readInt32());
  },

  vec3i(input: ISerialInput) {
    return vec3i(input.readInt32(), input.readInt32(), input.readInt32());
  },

  vec4i(input: ISerialInput) {
    return vec4i(
      input.readInt32(),
      input.readInt32(),
      input.readInt32(),
      input.readInt32(),
    );
  },

  vec2u(input) {
    return vec2u(input.readUint32(), input.readUint32());
  },

  vec3u(input: ISerialInput) {
    return vec3u(input.readUint32(), input.readUint32(), input.readUint32());
  },

  vec4u(input: ISerialInput) {
    return vec4u(
      input.readUint32(),
      input.readUint32(),
      input.readUint32(),
      input.readUint32(),
    );
  },

  mat2x2f(input: ISerialInput) {
    return mat2x2f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  mat3x3f(input: ISerialInput) {
    const skipOneAfter = () => {
      const value = input.readFloat32();
      input.readFloat32(); // skipping;
      return value;
    };

    return mat3x3f(
      input.readFloat32(),
      input.readFloat32(),
      skipOneAfter(),
      //
      input.readFloat32(),
      input.readFloat32(),
      skipOneAfter(),
      //
      input.readFloat32(),
      input.readFloat32(),
      skipOneAfter(),
    );
  },

  mat4x4f(input: ISerialInput) {
    return mat4x4f(
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

  struct(input: ISerialInput, schema: wgsl.WgslStruct) {
    const alignment = alignmentOf(schema);
    alignIO(input, alignment);
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(input, alignmentOf(property));
      result[key] = readData(input, property);
    }

    alignIO(input, alignment);
    return result as InferRecord<Record<string, wgsl.BaseWgslData>>;
  },

  array(input, schema) {
    if (schema.length === 0) {
      throw new Error('Cannot read using a runtime-sized schema.');
    }

    const alignment = alignmentOf(schema);
    const elements: unknown[] = [];

    for (let i = 0; i < schema.length; i++) {
      alignIO(input, alignment);
      const elementType = schema.elementType as wgsl.AnyWgslData;
      const value = readData(input, elementType);
      elements.push(value);
    }

    alignIO(input, alignment);
    return elements as never[];
  },

  atomic(input, schema: wgsl.Atomic): number {
    return readData(input, schema.inner);
  },

  decorated(input, schema: wgsl.Decorated) {
    const alignment = customAlignmentOf(schema);
    alignIO(input, alignment);

    const beginning = input.currentByteOffset;
    const value = readData(input, schema.inner);
    input.seekTo(beginning + sizeOf(schema));
    return value as never;
  },

  // Loose Types

  uint8x2: (i) => vec2u(i.readByte(), i.readByte()),
  uint8x4: (i) => vec4u(i.readByte(), i.readByte(), i.readByte(), i.readByte()),
  sint8x2: (i) => {
    return vec2i(sint8Read(i), sint8Read(i));
  },
  sint8x4: (i) => vec4i(sint8Read(i), sint8Read(i), sint8Read(i), sint8Read(i)),
  unorm8x2: (i) => vec2f(i.readByte() / 255, i.readByte() / 255),
  unorm8x4: (i) =>
    vec4f(
      i.readByte() / 255,
      i.readByte() / 255,
      i.readByte() / 255,
      i.readByte() / 255,
    ),
  snorm8x2: (i) =>
    vec2f((i.readByte() - 128) / 127, (i.readByte() - 128) / 127),
  snorm8x4: (i) =>
    vec4f(
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

    return vec2u(
      view.getUint16(0, littleEndian),
      view.getUint16(2, littleEndian),
    );
  },
  uint16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return vec4u(
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

    return vec2i(
      view.getInt16(0, littleEndian),
      view.getInt16(2, littleEndian),
    );
  },
  sint16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return vec4i(
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

    return vec2f(
      view.getUint16(0, littleEndian) / 65535,
      view.getUint16(2, littleEndian) / 65535,
    );
  },
  unorm16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return vec4f(
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

    return vec2f(
      (view.getUint16(0, littleEndian) - 32768) / 32767,
      (view.getUint16(2, littleEndian) - 32768) / 32767,
    );
  },
  snorm16x4(i) {
    const buffer = new ArrayBuffer(8);
    i.readSlice(new Uint8Array(buffer), 0, 8);
    const view = new DataView(buffer);
    const littleEndian = i.endianness === 'little';

    return vec4f(
      (view.getUint16(0, littleEndian) - 32768) / 32767,
      (view.getUint16(2, littleEndian) - 32768) / 32767,
      (view.getUint16(4, littleEndian) - 32768) / 32767,
      (view.getUint16(6, littleEndian) - 32768) / 32767,
    );
  },
  float16x2: (i) => vec2f(i.readFloat16(), i.readFloat16()),
  float16x4: (i) =>
    vec4f(i.readFloat16(), i.readFloat16(), i.readFloat16(), i.readFloat16()),
  float32: (i) => i.readFloat32(),
  float32x2: (i) => vec2f(i.readFloat32(), i.readFloat32()),
  float32x3: (i) => vec3f(i.readFloat32(), i.readFloat32(), i.readFloat32()),
  float32x4: (i) =>
    vec4f(i.readFloat32(), i.readFloat32(), i.readFloat32(), i.readFloat32()),
  uint32: (i) => i.readUint32(),
  uint32x2: (i) => vec2u(i.readUint32(), i.readUint32()),
  uint32x3: (i) => vec3u(i.readUint32(), i.readUint32(), i.readUint32()),
  uint32x4: (i) =>
    vec4u(i.readUint32(), i.readUint32(), i.readUint32(), i.readUint32()),
  sint32: (i) => i.readInt32(),
  sint32x2: (i) => vec2i(i.readInt32(), i.readInt32()),
  sint32x3: (i) => vec3i(i.readInt32(), i.readInt32(), i.readInt32()),
  sint32x4: (i) =>
    vec4i(i.readInt32(), i.readInt32(), i.readInt32(), i.readInt32()),
  'unorm10-10-10-2'(i) {
    const packed = i.readUint32();
    const r = (packed >> 22) / 1023;
    const g = ((packed >> 12) & 1023) / 1023;
    const b = ((packed >> 2) & 1023) / 1023;
    const a = (packed & 3) / 3;
    return vec4f(r, g, b, a);
  },

  'loose-struct'(input, schema: LooseStruct) {
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(schema.propTypes)) {
      result[key] = readData(input, property);
    }

    return result as InferRecord<Record<string, wgsl.BaseWgslData>>;
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
    alignIO(input, customAlignmentOf(schema));

    const beginning = input.currentByteOffset;
    const value = readData(input, schema.inner);
    input.seekTo(beginning + sizeOf(schema));
    return value;
  },
} satisfies CompleteDataReaders as Record<
  string,
  (input: ISerialInput, schema: unknown) => unknown
>;

export function readData<TData extends wgsl.BaseWgslData>(
  input: ISerialInput,
  schema: TData,
): Infer<TData> {
  const reader = dataReaders[schema.type];
  if (!reader) {
    throw new Error(`Cannot read data of type '${schema.type}'.`);
  }

  return reader(input, schema) as Infer<TData>;
}
