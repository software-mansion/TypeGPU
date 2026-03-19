import type { ISerialInput, ISerialOutput } from 'typed-binary';
import type { Infer, InferRecord } from '../shared/repr.ts';
import alignIO from './alignIO.ts';
import { alignmentOf, customAlignmentOf } from './alignmentOf.ts';
import type { AnyConcreteData, AnyData, Disarray, LooseDecorated, Unstruct } from './dataTypes.ts';
import { mat2x2f, mat3x3f, mat4x4f } from './matrix.ts';
import { sizeOf } from './sizeOf.ts';
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
} from './vector.ts';
import type * as wgsl from './wgslTypes.ts';

type DataWriter<TSchema extends wgsl.BaseData> = (
  output: ISerialOutput,
  schema: TSchema,
  value: Infer<TSchema>,
) => void;

type DataReader<TSchema extends wgsl.BaseData> = (
  input: ISerialInput,
  schema: TSchema,
) => Infer<TSchema>;

type CompleteDataWriters = {
  [TType in AnyConcreteData['type']]: DataWriter<Extract<AnyData, { readonly type: TType }>>;
};

type CompleteDataReaders = {
  [TType in AnyConcreteData['type']]: DataReader<Extract<AnyData, { readonly type: TType }>>;
};

const dataWriters = {
  bool() {
    throw new Error('Booleans are not host-shareable');
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

  u16(output, _schema: wgsl.U16, value: number) {
    output.writeUint16(value);
  },

  vec2f(output, _, value: wgsl.v2f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
  },

  vec2h(output, _, value: wgsl.v2h) {
    output.writeFloat16(value.x);
    output.writeFloat16(value.y);
  },

  vec2i(output, _, value: wgsl.v2i) {
    output.writeInt32(value.x);
    output.writeInt32(value.y);
  },

  vec2u(output, _, value: wgsl.v2u) {
    output.writeUint32(value.x);
    output.writeUint32(value.y);
  },

  'vec2<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  vec3f(output, _, value: wgsl.v3f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
  },

  vec3h(output, _, value: wgsl.v3h) {
    output.writeFloat16(value.x);
    output.writeFloat16(value.y);
    output.writeFloat16(value.z);
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

  'vec3<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  vec4f(output, _, value: wgsl.v4f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
    output.writeFloat32(value.w);
  },

  vec4h(output, _, value: wgsl.v4h) {
    output.writeFloat16(value.x);
    output.writeFloat16(value.y);
    output.writeFloat16(value.z);
    output.writeFloat16(value.w);
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

  'vec4<bool>'() {
    throw new Error('Booleans are not host-shareable');
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

  struct(output, schema: wgsl.WgslStruct, value: InferRecord<Record<string, wgsl.BaseData>>) {
    const alignment = alignmentOf(schema);
    alignIO(output, alignment);

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(output, alignmentOf(property));
      writeData(output, property, value[key]);
    }

    alignIO(output, alignment);
  },

  array(output, schema: wgsl.WgslArray, value: Infer<wgsl.BaseData>[]) {
    if (schema.elementCount === 0) {
      throw new Error('Cannot write using a runtime-sized schema.');
    }

    const alignment = alignmentOf(schema);
    alignIO(output, alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(schema.elementCount, value.length); i++) {
      alignIO(output, alignment);
      writeData(output, schema.elementType, value[i]);
    }
    output.seekTo(beginning + sizeOf(schema));
  },

  ptr() {
    throw new Error('Pointers are not host-shareable');
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

  uint8(output, _, value: number) {
    output.writeUint8(value);
  },
  uint8x2(output, _, value: wgsl.v2u) {
    output.writeUint8(value.x);
    output.writeUint8(value.y);
  },
  uint8x4(output, _, value: wgsl.v4u) {
    output.writeUint8(value.x);
    output.writeUint8(value.y);
    output.writeUint8(value.z);
    output.writeUint8(value.w);
  },
  sint8(output, _, value: number) {
    output.writeInt8(value);
  },
  sint8x2(output, _, value: wgsl.v2i) {
    output.writeInt8(value.x);
    output.writeInt8(value.y);
  },
  sint8x4(output, _, value: wgsl.v4i) {
    output.writeInt8(value.x);
    output.writeInt8(value.y);
    output.writeInt8(value.z);
    output.writeInt8(value.w);
  },
  unorm8(output, _, value: number) {
    output.writeUint8(Math.round(value * 255));
  },
  unorm8x2(output, _, value: wgsl.v2f) {
    output.writeUint8(Math.round(value.x * 255));
    output.writeUint8(Math.round(value.y * 255));
  },
  unorm8x4(output, _, value: wgsl.v4f) {
    output.writeUint8(Math.round(value.x * 255));
    output.writeUint8(Math.round(value.y * 255));
    output.writeUint8(Math.round(value.z * 255));
    output.writeUint8(Math.round(value.w * 255));
  },
  snorm8(output, _, value: number) {
    output.writeInt8(Math.round(value * 127));
  },
  snorm8x2(output, _, value: wgsl.v2f) {
    output.writeInt8(Math.round(value.x * 127));
    output.writeInt8(Math.round(value.y * 127));
  },
  snorm8x4(output, _, value: wgsl.v4f) {
    output.writeInt8(Math.round(value.x * 127));
    output.writeInt8(Math.round(value.y * 127));
    output.writeInt8(Math.round(value.z * 127));
    output.writeInt8(Math.round(value.w * 127));
  },
  uint16(output, _, value: number) {
    output.writeUint16(value);
  },
  uint16x2(output, _, value: wgsl.v2u) {
    output.writeUint16(value.x);
    output.writeUint16(value.y);
  },
  uint16x4(output, _, value: wgsl.v4u) {
    output.writeUint16(value.x);
    output.writeUint16(value.y);
    output.writeUint16(value.z);
    output.writeUint16(value.w);
  },
  sint16(output, _, value: number) {
    output.writeInt16(value);
  },
  sint16x2(output, _, value: wgsl.v2i) {
    output.writeInt16(value.x);
    output.writeInt16(value.y);
  },
  sint16x4(output, _, value: wgsl.v4i) {
    output.writeInt16(value.x);
    output.writeInt16(value.y);
    output.writeInt16(value.z);
    output.writeInt16(value.w);
  },
  unorm16(output, _, value: number) {
    output.writeUint16(value * 65535);
  },
  unorm16x2(output, _, value: wgsl.v2f) {
    output.writeUint16(value.x * 65535);
    output.writeUint16(value.y * 65535);
  },
  unorm16x4(output, _, value: wgsl.v4f) {
    output.writeUint16(value.x * 65535);
    output.writeUint16(value.y * 65535);
    output.writeUint16(value.z * 65535);
    output.writeUint16(value.w * 65535);
  },
  snorm16(output, _, value: number) {
    output.writeInt16(Math.round(value * 32767));
  },
  snorm16x2(output, _, value: wgsl.v2f) {
    output.writeInt16(Math.round(value.x * 32767));
    output.writeInt16(Math.round(value.y * 32767));
  },
  snorm16x4(output, _, value: wgsl.v4f) {
    output.writeInt16(Math.round(value.x * 32767));
    output.writeInt16(Math.round(value.y * 32767));
    output.writeInt16(Math.round(value.z * 32767));
    output.writeInt16(Math.round(value.w * 32767));
  },
  float16(output, _, value: number) {
    output.writeFloat16(value);
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
    packed |= ((value.y * 1023) & 1023) << 12; // g (10 bits)
    packed |= ((value.z * 1023) & 1023) << 2; // b (10 bits)
    packed |= (value.w * 3) & 3; // a (2 bits)
    output.writeUint32(packed);
  },
  'unorm8x4-bgra'(output, _, value: wgsl.v4f) {
    output.writeUint8(value.z * 255);
    output.writeUint8(value.y * 255);
    output.writeUint8(value.x * 255);
    output.writeUint8(value.w * 255);
  },

  disarray(output, schema: Disarray, value: unknown[]) {
    const alignment = alignmentOf(schema);

    alignIO(output, alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(schema.elementCount, value.length); i++) {
      alignIO(output, alignment);
      dataWriters[(schema.elementType as AnyData)?.type]?.(output, schema.elementType, value[i]);
    }

    output.seekTo(beginning + sizeOf(schema));
  },

  unstruct(output, schema: Unstruct, value) {
    const propTypes = schema.propTypes;
    for (const [key, property] of Object.entries(propTypes)) {
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
  // TODO: Move texture IO logic here after we expand repr to have in/out variants
} satisfies CompleteDataWriters as Record<
  string,
  (output: ISerialOutput, schema: unknown, value: unknown) => void
>;

export function writeData<TData extends wgsl.BaseData>(
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
  bool(): boolean {
    throw new Error('Booleans are not host-shareable');
  },

  f32(input: ISerialInput): number {
    return input.readFloat32();
  },

  f16(input: ISerialInput): number {
    return input.readFloat16();
  },

  i32(input: ISerialInput): number {
    return input.readInt32();
  },

  u32(input: ISerialInput): number {
    return input.readUint32();
  },

  u16(input: ISerialInput): number {
    return input.readUint16();
  },

  vec2f(input: ISerialInput): wgsl.v2f {
    return vec2f(input.readFloat32(), input.readFloat32());
  },

  vec3f(input: ISerialInput): wgsl.v3f {
    return vec3f(input.readFloat32(), input.readFloat32(), input.readFloat32());
  },

  vec4f(input: ISerialInput): wgsl.v4f {
    return vec4f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  vec2h(input): wgsl.v2h {
    return vec2h(input.readFloat16(), input.readFloat16());
  },

  vec3h(input: ISerialInput): wgsl.v3h {
    return vec3h(input.readFloat16(), input.readFloat16(), input.readFloat16());
  },

  vec4h(input: ISerialInput): wgsl.v4h {
    return vec4h(
      input.readFloat16(),
      input.readFloat16(),
      input.readFloat16(),
      input.readFloat16(),
    );
  },

  vec2i(input): wgsl.v2i {
    return vec2i(input.readInt32(), input.readInt32());
  },

  vec3i(input: ISerialInput): wgsl.v3i {
    return vec3i(input.readInt32(), input.readInt32(), input.readInt32());
  },

  vec4i(input: ISerialInput): wgsl.v4i {
    return vec4i(input.readInt32(), input.readInt32(), input.readInt32(), input.readInt32());
  },

  vec2u(input): wgsl.v2u {
    return vec2u(input.readUint32(), input.readUint32());
  },

  vec3u(input: ISerialInput): wgsl.v3u {
    return vec3u(input.readUint32(), input.readUint32(), input.readUint32());
  },

  vec4u(input: ISerialInput): wgsl.v4u {
    return vec4u(input.readUint32(), input.readUint32(), input.readUint32(), input.readUint32());
  },

  'vec2<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  'vec3<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  'vec4<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  mat2x2f(input: ISerialInput): wgsl.m2x2f {
    return mat2x2f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
    );
  },

  mat3x3f(input: ISerialInput): wgsl.m3x3f {
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

  mat4x4f(input: ISerialInput): wgsl.m4x4f {
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

    const propTypes = schema.propTypes;
    for (const [key, property] of Object.entries(propTypes)) {
      alignIO(input, alignmentOf(property));
      result[key] = readData(input, property);
    }

    alignIO(input, alignment);
    return result as InferRecord<Record<string, wgsl.BaseData>>;
  },

  array(input, schema) {
    if (schema.elementCount === 0) {
      throw new Error('Cannot read using a runtime-sized schema.');
    }

    const alignment = alignmentOf(schema);
    const elements: unknown[] = [];

    for (let i = 0; i < schema.elementCount; i++) {
      alignIO(input, alignment);
      const elementType = schema.elementType as wgsl.AnyWgslData;
      const value = readData(input, elementType);
      elements.push(value);
    }

    alignIO(input, alignment);
    return elements as never[];
  },

  ptr() {
    throw new Error('Pointers are not host-shareable');
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

  uint8: (i) => i.readUint8(),
  uint8x2: (i) => vec2u(i.readUint8(), i.readUint8()),
  uint8x4: (i) => vec4u(i.readUint8(), i.readUint8(), i.readUint8(), i.readUint8()),
  sint8: (i) => i.readInt8(),
  sint8x2: (i) => {
    return vec2i(i.readInt8(), i.readInt8());
  },
  sint8x4: (i) => vec4i(i.readInt8(), i.readInt8(), i.readInt8(), i.readInt8()),
  unorm8: (i) => i.readUint8() / 255,
  unorm8x2: (i) => vec2f(i.readUint8() / 255, i.readUint8() / 255),
  unorm8x4: (i) =>
    vec4f(i.readUint8() / 255, i.readUint8() / 255, i.readUint8() / 255, i.readUint8() / 255),
  snorm8: (i) => i.readInt8() / 127,
  snorm8x2: (i) => vec2f(i.readInt8() / 127, i.readInt8() / 127),
  snorm8x4: (i) =>
    vec4f(i.readInt8() / 127, i.readInt8() / 127, i.readInt8() / 127, i.readInt8() / 127),
  uint16: (i) => i.readUint16(),
  uint16x2: (i) => vec2u(i.readUint16(), i.readUint16()),
  uint16x4: (i) => vec4u(i.readUint16(), i.readUint16(), i.readUint16(), i.readUint16()),
  sint16: (i) => i.readInt16(),
  sint16x2: (i) => vec2i(i.readInt16(), i.readInt16()),
  sint16x4: (i) => vec4i(i.readInt16(), i.readInt16(), i.readInt16(), i.readInt16()),
  unorm16: (i) => i.readUint16() / 65535,
  unorm16x2: (i) => vec2f(i.readUint16() / 65535, i.readUint16() / 65535),
  unorm16x4: (i) =>
    vec4f(
      i.readUint16() / 65535,
      i.readUint16() / 65535,
      i.readUint16() / 65535,
      i.readUint16() / 65535,
    ),
  snorm16: (i) => i.readInt16() / 32767,
  snorm16x2: (i): wgsl.v2f => vec2f(i.readInt16() / 32767, i.readInt16() / 32767),
  snorm16x4: (i): wgsl.v4f =>
    vec4f(
      i.readInt16() / 32767,
      i.readInt16() / 32767,
      i.readInt16() / 32767,
      i.readInt16() / 32767,
    ),
  float16(i) {
    return i.readFloat16();
  },
  float16x2: (i) => vec2f(i.readFloat16(), i.readFloat16()),
  float16x4: (i) => vec4f(i.readFloat16(), i.readFloat16(), i.readFloat16(), i.readFloat16()),
  float32: (i) => i.readFloat32(),
  float32x2: (i) => vec2f(i.readFloat32(), i.readFloat32()),
  float32x3: (i) => vec3f(i.readFloat32(), i.readFloat32(), i.readFloat32()),
  float32x4: (i) => vec4f(i.readFloat32(), i.readFloat32(), i.readFloat32(), i.readFloat32()),
  uint32: (i) => i.readUint32(),
  uint32x2: (i) => vec2u(i.readUint32(), i.readUint32()),
  uint32x3: (i) => vec3u(i.readUint32(), i.readUint32(), i.readUint32()),
  uint32x4: (i) => vec4u(i.readUint32(), i.readUint32(), i.readUint32(), i.readUint32()),
  sint32: (i) => i.readInt32(),
  sint32x2: (i) => vec2i(i.readInt32(), i.readInt32()),
  sint32x3: (i) => vec3i(i.readInt32(), i.readInt32(), i.readInt32()),
  sint32x4: (i) => vec4i(i.readInt32(), i.readInt32(), i.readInt32(), i.readInt32()),
  'unorm10-10-10-2'(i) {
    const packed = i.readUint32();
    const r = (packed >> 22) / 1023;
    const g = ((packed >> 12) & 1023) / 1023;
    const b = ((packed >> 2) & 1023) / 1023;
    const a = (packed & 3) / 3;
    return vec4f(r, g, b, a);
  },
  'unorm8x4-bgra'(i) {
    const b = i.readByte() / 255;
    const g = i.readByte() / 255;
    const r = i.readByte() / 255;
    const a = i.readByte() / 255;
    return vec4f(r, g, b, a);
  },

  unstruct(input, schema: Unstruct) {
    const result = {} as Record<string, unknown>;

    const propTypes = schema.propTypes;
    for (const [key, property] of Object.entries(propTypes)) {
      result[key] = readData(input, property);
    }

    return result as InferRecord<Record<string, wgsl.BaseData>>;
  },

  disarray(input, schema: Disarray) {
    const alignment = alignmentOf(schema);
    const elements: unknown[] = [];

    for (let i = 0; i < schema.elementCount; i++) {
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
  // TODO: Move texture IO logic here after we expand repr to have in/out variants
} satisfies CompleteDataReaders;

export function readData<TData extends wgsl.BaseData>(
  input: ISerialInput,
  schema: TData,
): Infer<TData> {
  const reader = (dataReaders as Record<string, unknown>)[schema.type] as DataReader<TData>;
  if (!reader) {
    throw new Error(`Cannot read data of type '${schema.type}'.`);
  }

  return reader(input, schema);
}
