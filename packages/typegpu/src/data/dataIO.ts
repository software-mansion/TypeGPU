import type { ISerialInput, ISerialOutput } from 'typed-binary';
import type { Infer, InferRecord } from '../shared/repr';
import alignIO from './alignIO';
import { type LooseDecorated, getCustomAlignment } from './attributes';
import type { AnyData, LooseArray, TgpuLooseStruct } from './dataTypes';
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
import {
  type AnyWgslData,
  type Atomic,
  type BaseWgslData,
  type Bool,
  type Decorated,
  type F32,
  type I32,
  type U32,
  type WgslArray,
  type WgslStruct,
  alignmentOfData,
  sizeOfData,
  type vec2f,
  type vec2i,
  type vec2u,
  type vec3f,
  type vec3i,
  type vec3u,
  type vec4f,
  type vec4i,
  type vec4u,
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

export const dataWriters = {
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

  struct(output, schema: WgslStruct, value: Record<string, unknown>) {
    alignIO(output, schema.alignment);

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(output, alignmentOfData(property));
      dataWriters[(property as AnyWgslData)?.type]?.(
        output,
        property,
        value[key],
      );
    }

    alignIO(output, schema.alignment);
  },

  array(output, schema: WgslArray, value: unknown[]) {
    alignIO(output, schema.alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(schema.length, value.length); i++) {
      alignIO(output, schema.alignment);
      const elementType = schema.elementType as AnyWgslData;
      dataWriters[elementType?.type]?.(output, elementType, value[i]);
    }
    output.seekTo(beginning + schema.size);
  },

  atomic(output, schema: Atomic, value: number) {
    dataWriters[schema.inner.type]?.(output, schema, value);
  },

  decorated(output, schema: Decorated, value: unknown) {
    const alignment = getCustomAlignment(schema) ?? 1;
    alignIO(output, alignment);

    const beginning = output.currentByteOffset;
    dataWriters[(schema.inner as AnyData)?.type]?.(output, schema.inner, value);
    output.seekTo(beginning + schema.size);
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
    output.writeByte((value.x & 127) | (value.x < 0 ? 128 : 0));
    output.writeByte((value.y & 127) | (value.y < 0 ? 128 : 0));
  },
  sint8x4(output, _, value: vec4i) {
    output.writeByte((value.x & 127) | (value.x < 0 ? 128 : 0));
    output.writeByte((value.y & 127) | (value.y < 0 ? 128 : 0));
    output.writeByte((value.z & 127) | (value.z < 0 ? 128 : 0));
    output.writeByte((value.w & 127) | (value.w < 0 ? 128 : 0));
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
    view.setUint16(0, Math.floor(value.x * 255), littleEndian);
    view.setUint16(2, Math.floor(value.y * 255), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  unorm16x4(output, _, value: vec4f) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setInt16(0, Math.floor(value.x * 255), littleEndian);
    view.setInt16(2, Math.floor(value.y * 255), littleEndian);
    view.setInt16(4, Math.floor(value.z * 255), littleEndian);
    view.setInt16(6, Math.floor(value.w * 255), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  snorm16x2(output, _, value: vec2f) {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setUint16(0, Math.floor(value.x * 127 + 128), littleEndian);
    view.setUint16(2, Math.floor(value.y * 127 + 128), littleEndian);
    output.writeSlice(new Uint8Array(buffer));
  },
  snorm16x4(output, _, value: vec4f) {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    const littleEndian = output.endianness === 'little';
    view.setInt16(0, Math.floor(value.x * 127 + 128), littleEndian);
    view.setInt16(2, Math.floor(value.y * 127 + 128), littleEndian);
    view.setInt16(4, Math.floor(value.z * 127 + 128), littleEndian);
    view.setInt16(6, Math.floor(value.w * 127 + 128), littleEndian);
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
    packed |= (value.z * 3) & 4; // a (2 bits)
    output.writeUint32(packed);
  },

  'loose-array'(output, schema: LooseArray, value: unknown[]) {
    const alignment = alignmentOfData(schema);
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
    output.seekTo(beginning + sizeOfData(schema));
  },

  'loose-struct'(output, schema: TgpuLooseStruct, value) {
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
    output.seekTo(beginning + sizeOfData(schema));
    return value;
  },
} satisfies CompleteDataWriters as Record<
  string,
  (output: ISerialOutput, schema: unknown, value: unknown) => void
>;

export const dataReaders = {
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

  struct(input: ISerialInput, schema: WgslStruct) {
    alignIO(input, schema.alignment);
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(input, alignmentOfData(property));
      result[key] = dataReaders[(property as AnyWgslData)?.type]?.(
        input,
        property,
      );
    }

    alignIO(input, schema.alignment);
    return result as InferRecord<Record<string, BaseWgslData>>;
  },

  array(input, schema) {
    alignIO(input, schema.alignment);
    const elements: unknown[] = [];
    for (let i = 0; i < schema.length; i++) {
      alignIO(input, schema.alignment);
      const elementType = schema.elementType as AnyWgslData;
      const value = dataReaders[elementType?.type]?.(input, elementType);
      elements.push(value);
    }
    alignIO(input, schema.alignment);
    return elements as never[];
  },

  atomic(input, schema: Atomic): number {
    return dataReaders[(schema.inner as AnyData)?.type]?.(
      input,
      schema.inner,
    ) as number;
  },

  decorated(input, schema: Decorated) {
    const alignment = getCustomAlignment(schema) ?? 1;
    alignIO(input, alignment);

    const beginning = input.currentByteOffset;
    const reader = dataReaders[(schema.inner as AnyData)?.type];
    const value = reader?.(input, schema.inner);
    input.seekTo(beginning + schema.size);
    return value as never;
  },

  'loose-struct'(input, schema: TgpuLooseStruct) {
    const result = {} as Record<string, unknown>;

    for (const [key, property] of Object.entries(schema.propTypes)) {
      result[key] = dataReaders[property.type]?.(input, property);
    }

    return result as InferRecord<Record<string, BaseWgslData>>;
  },
} satisfies CompleteDataReaders as Record<
  string,
  (input: ISerialInput, schema: unknown) => unknown
>;
