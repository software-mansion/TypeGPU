import * as TB from 'typed-binary';
import type { Infer, InferInput, InferRecord } from '../shared/repr.ts';
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
import * as wgsl from './wgslTypes.ts';
import type { BufferWriteOptions } from '../core/buffer/buffer.ts';
import { getCompiledWriter } from './compiledIO.ts';
import { getName } from '../shared/meta.ts';
import { roundUp } from '../mathUtils.ts';
import { logger } from '../tgpuLogger.ts';
import { readFloat16, writeFloat16 } from './float16Conversion.ts';

type DataWriter<TSchema extends wgsl.BaseData> = (
  output: TB.ByteCursor,
  schema: TSchema,
  value: InferInput<TSchema>,
) => void;

type DataReader<TSchema extends wgsl.BaseData> = (
  input: TB.ByteCursor,
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

  f32(output, _schema, value) {
    TB.f32.write(output, value);
  },

  f16(output, _schema, value) {
    writeFloat16(output, value);
  },

  i32(output, _schema, value) {
    TB.i32.write(output, value);
  },

  u32(output, _schema, value) {
    TB.u32.write(output, value);
  },

  u16(output, _schema, value) {
    TB.u16.write(output, value);
  },

  vec2f(output, _, value) {
    TB.f32.write(output, value[0]);
    TB.f32.write(output, value[1]);
  },

  vec2h(output, _, value) {
    writeFloat16(output, value[0]);
    writeFloat16(output, value[1]);
  },

  vec2i(output, _, value) {
    TB.i32.write(output, value[0]);
    TB.i32.write(output, value[1]);
  },

  vec2u(output, _, value) {
    TB.u32.write(output, value[0]);
    TB.u32.write(output, value[1]);
  },

  'vec2<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  vec3f(output, _, value) {
    TB.f32.write(output, value[0]);
    TB.f32.write(output, value[1]);
    TB.f32.write(output, value[2]);
  },

  vec3h(output, _, value) {
    writeFloat16(output, value[0]);
    writeFloat16(output, value[1]);
    writeFloat16(output, value[2]);
  },

  vec3i(output, _, value) {
    TB.i32.write(output, value[0]);
    TB.i32.write(output, value[1]);
    TB.i32.write(output, value[2]);
  },

  vec3u(output, _, value) {
    TB.u32.write(output, value[0]);
    TB.u32.write(output, value[1]);
    TB.u32.write(output, value[2]);
  },

  'vec3<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  vec4f(output, _, value) {
    TB.f32.write(output, value[0]);
    TB.f32.write(output, value[1]);
    TB.f32.write(output, value[2]);
    TB.f32.write(output, value[3]);
  },

  vec4h(output, _, value) {
    writeFloat16(output, value[0]);
    writeFloat16(output, value[1]);
    writeFloat16(output, value[2]);
    writeFloat16(output, value[3]);
  },

  vec4i(output, _, value) {
    TB.i32.write(output, value[0]);
    TB.i32.write(output, value[1]);
    TB.i32.write(output, value[2]);
    TB.i32.write(output, value[3]);
  },

  vec4u(output, _, value) {
    TB.u32.write(output, value[0]);
    TB.u32.write(output, value[1]);
    TB.u32.write(output, value[2]);
    TB.u32.write(output, value[3]);
  },

  'vec4<bool>'() {
    throw new Error('Booleans are not host-shareable');
  },

  mat2x2f(output, _, value) {
    for (let i = 0; i < value.length; ++i) {
      TB.f32.write(output, value[i] as number);
    }
  },

  mat3x3f(output, _, value) {
    if (value instanceof Float32Array || wgsl.isMatInstance(value)) {
      for (let i = 0; i < value.length; ++i) {
        TB.f32.write(output, value[i] as number);
      }
    } else {
      for (let i = 0; i < 3; ++i) {
        for (let j = 0; j < 3; ++j) {
          TB.f32.write(output, value[3 * i + j] as number);
        }
        TB.f32.write(output, 0);
      }
    }
  },

  mat4x4f(output, _, value) {
    for (let i = 0; i < value.length; ++i) {
      TB.f32.write(output, value[i] as number);
    }
  },

  struct(output, schema, value) {
    const alignment = alignmentOf(schema);
    alignIO(output, alignment);

    for (const [key, property] of Object.entries(schema.propTypes)) {
      alignIO(output, alignmentOf(property));
      writeData(output, property, value[key]);
    }

    alignIO(output, alignment);
  },

  array(output, schema, value) {
    if (schema.elementCount === 0) {
      throw new Error('Cannot write using a runtime-sized schema.');
    }

    const alignment = alignmentOf(schema);
    alignIO(output, alignment);
    const beginning = output.offset;
    for (let i = 0; i < Math.min(schema.elementCount, value.length); i++) {
      alignIO(output, alignment);
      writeData(output, schema.elementType, value[i]);
    }
    output.offset = beginning + sizeOf(schema);
  },

  ptr() {
    throw new Error('Pointers are not host-shareable');
  },

  atomic(output, schema, value) {
    dataWriters[schema.inner.type]?.(output, schema, value);
  },

  decorated(output, schema, value) {
    const alignment = customAlignmentOf(schema);
    alignIO(output, alignment);

    const beginning = output.offset;
    dataWriters[(schema.inner as AnyData)?.type]?.(output, schema.inner, value);
    output.offset = beginning + sizeOf(schema);
  },

  // Loose Types

  uint8(output, _, value) {
    TB.u8.write(output, value);
  },
  uint8x2(output, _, value) {
    TB.u8.write(output, value.x);
    TB.u8.write(output, value.y);
  },
  uint8x4(output, _, value) {
    TB.u8.write(output, value.x);
    TB.u8.write(output, value.y);
    TB.u8.write(output, value.z);
    TB.u8.write(output, value.w);
  },
  sint8(output, _, value) {
    TB.i8.write(output, value);
  },
  sint8x2(output, _, value) {
    TB.i8.write(output, value.x);
    TB.i8.write(output, value.y);
  },
  sint8x4(output, _, value) {
    TB.i8.write(output, value.x);
    TB.i8.write(output, value.y);
    TB.i8.write(output, value.z);
    TB.i8.write(output, value.w);
  },
  unorm8(output, _, value) {
    TB.u8.write(output, Math.round(value * 255));
  },
  unorm8x2(output, _, value) {
    TB.u8.write(output, Math.round(value.x * 255));
    TB.u8.write(output, Math.round(value.y * 255));
  },
  unorm8x4(output, _, value) {
    TB.u8.write(output, Math.round(value.x * 255));
    TB.u8.write(output, Math.round(value.y * 255));
    TB.u8.write(output, Math.round(value.z * 255));
    TB.u8.write(output, Math.round(value.w * 255));
  },
  snorm8(output, _, value) {
    TB.i8.write(output, Math.round(value * 127));
  },
  snorm8x2(output, _, value) {
    TB.i8.write(output, Math.round(value.x * 127));
    TB.i8.write(output, Math.round(value.y * 127));
  },
  snorm8x4(output, _, value) {
    TB.i8.write(output, Math.round(value.x * 127));
    TB.i8.write(output, Math.round(value.y * 127));
    TB.i8.write(output, Math.round(value.z * 127));
    TB.i8.write(output, Math.round(value.w * 127));
  },
  uint16(output, _, value) {
    TB.u16.write(output, value);
  },
  uint16x2(output, _, value) {
    TB.u16.write(output, value.x);
    TB.u16.write(output, value.y);
  },
  uint16x4(output, _, value) {
    TB.u16.write(output, value.x);
    TB.u16.write(output, value.y);
    TB.u16.write(output, value.z);
    TB.u16.write(output, value.w);
  },
  sint16(output, _, value) {
    TB.i16.write(output, value);
  },
  sint16x2(output, _, value) {
    TB.i16.write(output, value.x);
    TB.i16.write(output, value.y);
  },
  sint16x4(output, _, value) {
    TB.i16.write(output, value.x);
    TB.i16.write(output, value.y);
    TB.i16.write(output, value.z);
    TB.i16.write(output, value.w);
  },
  unorm16(output, _, value) {
    TB.u16.write(output, Math.round(value * 65535));
  },
  unorm16x2(output, _, value) {
    TB.u16.write(output, Math.round(value.x * 65535));
    TB.u16.write(output, Math.round(value.y * 65535));
  },
  unorm16x4(output, _, value) {
    TB.u16.write(output, Math.round(value.x * 65535));
    TB.u16.write(output, Math.round(value.y * 65535));
    TB.u16.write(output, Math.round(value.z * 65535));
    TB.u16.write(output, Math.round(value.w * 65535));
  },
  snorm16(output, _, value) {
    TB.i16.write(output, Math.round(value * 32767));
  },
  snorm16x2(output, _, value) {
    TB.i16.write(output, Math.round(value.x * 32767));
    TB.i16.write(output, Math.round(value.y * 32767));
  },
  snorm16x4(output, _, value) {
    TB.i16.write(output, Math.round(value.x * 32767));
    TB.i16.write(output, Math.round(value.y * 32767));
    TB.i16.write(output, Math.round(value.z * 32767));
    TB.i16.write(output, Math.round(value.w * 32767));
  },
  float16(output, _, value) {
    writeFloat16(output, value);
  },
  float16x2(output, _, value) {
    writeFloat16(output, value.x);
    writeFloat16(output, value.y);
  },
  float16x4(output, _, value) {
    writeFloat16(output, value.x);
    writeFloat16(output, value.y);
    writeFloat16(output, value.z);
    writeFloat16(output, value.w);
  },
  float32(output, _, value) {
    TB.f32.write(output, value);
  },
  float32x2(output, _, value) {
    TB.f32.write(output, value.x);
    TB.f32.write(output, value.y);
  },
  float32x3(output, _, value) {
    TB.f32.write(output, value.x);
    TB.f32.write(output, value.y);
    TB.f32.write(output, value.z);
  },
  float32x4(output, _, value) {
    TB.f32.write(output, value.x);
    TB.f32.write(output, value.y);
    TB.f32.write(output, value.z);
    TB.f32.write(output, value.w);
  },
  uint32(output, _, value) {
    TB.u32.write(output, value);
  },
  uint32x2(output, _, value) {
    TB.u32.write(output, value.x);
    TB.u32.write(output, value.y);
  },
  uint32x3(output, _, value) {
    TB.u32.write(output, value.x);
    TB.u32.write(output, value.y);
    TB.u32.write(output, value.z);
  },
  uint32x4(output, _, value) {
    TB.u32.write(output, value.x);
    TB.u32.write(output, value.y);
    TB.u32.write(output, value.z);
    TB.u32.write(output, value.w);
  },
  sint32(output, _, value) {
    TB.i32.write(output, value);
  },
  sint32x2(output, _, value) {
    TB.i32.write(output, value.x);
    TB.i32.write(output, value.y);
  },
  sint32x3(output, _, value) {
    TB.i32.write(output, value.x);
    TB.i32.write(output, value.y);
    TB.i32.write(output, value.z);
  },
  sint32x4(output, _, value) {
    TB.i32.write(output, value.x);
    TB.i32.write(output, value.y);
    TB.i32.write(output, value.z);
    TB.i32.write(output, value.w);
  },
  'unorm10-10-10-2'(output, _, value) {
    let packed = 0;
    packed |= (Math.round(value.x * 1023) & 1023) << 22; // r (10 bits)
    packed |= (Math.round(value.y * 1023) & 1023) << 12; // g (10 bits)
    packed |= (Math.round(value.z * 1023) & 1023) << 2; // b (10 bits)
    packed |= Math.round(value.w * 3) & 3; // a (2 bits)
    TB.u32.write(output, packed);
  },
  'unorm8x4-bgra'(output, _, value) {
    TB.u8.write(output, Math.round(value.z * 255));
    TB.u8.write(output, Math.round(value.y * 255));
    TB.u8.write(output, Math.round(value.x * 255));
    TB.u8.write(output, Math.round(value.w * 255));
  },

  disarray(output, schema, value) {
    const alignment = alignmentOf(schema);

    alignIO(output, alignment);
    const beginning = output.offset;
    for (let i = 0; i < Math.min(schema.elementCount, value.length); i++) {
      alignIO(output, alignment);
      dataWriters[(schema.elementType as AnyData)?.type]?.(output, schema.elementType, value[i]);
    }

    output.offset = beginning + sizeOf(schema);
  },

  unstruct(output, schema, value) {
    const propTypes = schema.propTypes;
    for (const [key, property] of Object.entries(propTypes)) {
      dataWriters[property.type]?.(output, property, value[key]);
    }
  },

  'loose-decorated'(output, schema, value) {
    const alignment = customAlignmentOf(schema);
    alignIO(output, alignment);

    const beginning = output.offset;
    const writer = dataWriters[(schema.inner as AnyData)?.type];
    writer?.(output, schema.inner, value);
    output.offset = beginning + sizeOf(schema);
    return value;
  },
  // TODO: Move texture IO logic here after we expand repr to have in/out variants
} satisfies CompleteDataWriters as Record<
  string,
  (output: TB.ByteCursor, schema: unknown, value: unknown) => void
>;

export function writeData<TData extends wgsl.BaseData>(
  output: TB.ByteCursor,
  schema: TData,
  value: InferInput<TData>,
): void {
  if (ArrayBuffer.isView(value)) {
    const src = value as ArrayBufferView;
    const expected = sizeOf(schema);
    if (src.byteLength !== expected) {
      logger.warn(
        'suspicious',
        `TypedArray size mismatch: schema expects ${expected} bytes, got ${src.byteLength}. ` +
          (src.byteLength < expected ? 'Data truncated.' : 'Excess ignored.'),
      );
    }
    const { view } = output;
    new Uint8Array(view.buffer, view.byteOffset + output.offset).set(
      new Uint8Array(src.buffer, src.byteOffset, Math.min(src.byteLength, expected)),
    );
    output.offset += expected;
    return;
  }

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

  f32(input: TB.ByteCursor): number {
    return TB.f32.read(input);
  },

  f16(input: TB.ByteCursor): number {
    return readFloat16(input);
  },

  i32(input: TB.ByteCursor): number {
    return TB.i32.read(input);
  },

  u32(input: TB.ByteCursor): number {
    return TB.u32.read(input);
  },

  u16(input: TB.ByteCursor): number {
    return TB.u16.read(input);
  },

  vec2f(input: TB.ByteCursor): wgsl.v2f {
    return vec2f(TB.f32.read(input), TB.f32.read(input));
  },

  vec3f(input: TB.ByteCursor): wgsl.v3f {
    return vec3f(TB.f32.read(input), TB.f32.read(input), TB.f32.read(input));
  },

  vec4f(input: TB.ByteCursor): wgsl.v4f {
    return vec4f(TB.f32.read(input), TB.f32.read(input), TB.f32.read(input), TB.f32.read(input));
  },

  vec2h(input): wgsl.v2h {
    return vec2h(readFloat16(input), readFloat16(input));
  },

  vec3h(input: TB.ByteCursor): wgsl.v3h {
    return vec3h(readFloat16(input), readFloat16(input), readFloat16(input));
  },

  vec4h(input: TB.ByteCursor): wgsl.v4h {
    return vec4h(readFloat16(input), readFloat16(input), readFloat16(input), readFloat16(input));
  },

  vec2i(input): wgsl.v2i {
    return vec2i(TB.i32.read(input), TB.i32.read(input));
  },

  vec3i(input: TB.ByteCursor): wgsl.v3i {
    return vec3i(TB.i32.read(input), TB.i32.read(input), TB.i32.read(input));
  },

  vec4i(input: TB.ByteCursor): wgsl.v4i {
    return vec4i(TB.i32.read(input), TB.i32.read(input), TB.i32.read(input), TB.i32.read(input));
  },

  vec2u(input): wgsl.v2u {
    return vec2u(TB.u32.read(input), TB.u32.read(input));
  },

  vec3u(input: TB.ByteCursor): wgsl.v3u {
    return vec3u(TB.u32.read(input), TB.u32.read(input), TB.u32.read(input));
  },

  vec4u(input: TB.ByteCursor): wgsl.v4u {
    return vec4u(TB.u32.read(input), TB.u32.read(input), TB.u32.read(input), TB.u32.read(input));
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

  mat2x2f(input: TB.ByteCursor): wgsl.m2x2f {
    return mat2x2f(TB.f32.read(input), TB.f32.read(input), TB.f32.read(input), TB.f32.read(input));
  },

  mat3x3f(input: TB.ByteCursor): wgsl.m3x3f {
    const skipOneAfter = () => {
      const value = TB.f32.read(input);
      TB.f32.read(input); // skipping;
      return value;
    };

    return mat3x3f(
      TB.f32.read(input),
      TB.f32.read(input),
      skipOneAfter(),
      //
      TB.f32.read(input),
      TB.f32.read(input),
      skipOneAfter(),
      //
      TB.f32.read(input),
      TB.f32.read(input),
      skipOneAfter(),
    );
  },

  mat4x4f(input: TB.ByteCursor): wgsl.m4x4f {
    return mat4x4f(
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
      //
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
      //
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
      //
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
      TB.f32.read(input),
    );
  },

  struct(input: TB.ByteCursor, schema: wgsl.WgslStruct) {
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

    const beginning = input.offset;
    const value = readData(input, schema.inner);
    input.offset = beginning + sizeOf(schema);
    return value as never;
  },

  // Loose Types

  uint8: (i) => TB.u8.read(i),
  uint8x2: (i) => vec2u(TB.u8.read(i), TB.u8.read(i)),
  uint8x4: (i) => vec4u(TB.u8.read(i), TB.u8.read(i), TB.u8.read(i), TB.u8.read(i)),
  sint8: (i) => TB.i8.read(i),
  sint8x2: (i) => {
    return vec2i(TB.i8.read(i), TB.i8.read(i));
  },
  sint8x4: (i) => vec4i(TB.i8.read(i), TB.i8.read(i), TB.i8.read(i), TB.i8.read(i)),
  unorm8: (i) => TB.u8.read(i) / 255,
  unorm8x2: (i) => vec2f(TB.u8.read(i) / 255, TB.u8.read(i) / 255),
  unorm8x4: (i) =>
    vec4f(TB.u8.read(i) / 255, TB.u8.read(i) / 255, TB.u8.read(i) / 255, TB.u8.read(i) / 255),
  snorm8: (i) => TB.i8.read(i) / 127,
  snorm8x2: (i) => vec2f(TB.i8.read(i) / 127, TB.i8.read(i) / 127),
  snorm8x4: (i) =>
    vec4f(TB.i8.read(i) / 127, TB.i8.read(i) / 127, TB.i8.read(i) / 127, TB.i8.read(i) / 127),
  uint16: (i) => TB.u16.read(i),
  uint16x2: (i) => vec2u(TB.u16.read(i), TB.u16.read(i)),
  uint16x4: (i) => vec4u(TB.u16.read(i), TB.u16.read(i), TB.u16.read(i), TB.u16.read(i)),
  sint16: (i) => TB.i16.read(i),
  sint16x2: (i) => vec2i(TB.i16.read(i), TB.i16.read(i)),
  sint16x4: (i) => vec4i(TB.i16.read(i), TB.i16.read(i), TB.i16.read(i), TB.i16.read(i)),
  unorm16: (i) => TB.u16.read(i) / 65535,
  unorm16x2: (i) => vec2f(TB.u16.read(i) / 65535, TB.u16.read(i) / 65535),
  unorm16x4: (i) =>
    vec4f(
      TB.u16.read(i) / 65535,
      TB.u16.read(i) / 65535,
      TB.u16.read(i) / 65535,
      TB.u16.read(i) / 65535,
    ),
  snorm16: (i) => TB.i16.read(i) / 32767,
  snorm16x2: (i): wgsl.v2f => vec2f(TB.i16.read(i) / 32767, TB.i16.read(i) / 32767),
  snorm16x4: (i): wgsl.v4f =>
    vec4f(
      TB.i16.read(i) / 32767,
      TB.i16.read(i) / 32767,
      TB.i16.read(i) / 32767,
      TB.i16.read(i) / 32767,
    ),
  float16(i) {
    return readFloat16(i);
  },
  float16x2: (i) => vec2f(readFloat16(i), readFloat16(i)),
  float16x4: (i) => vec4f(readFloat16(i), readFloat16(i), readFloat16(i), readFloat16(i)),
  float32: (i) => TB.f32.read(i),
  float32x2: (i) => vec2f(TB.f32.read(i), TB.f32.read(i)),
  float32x3: (i) => vec3f(TB.f32.read(i), TB.f32.read(i), TB.f32.read(i)),
  float32x4: (i) => vec4f(TB.f32.read(i), TB.f32.read(i), TB.f32.read(i), TB.f32.read(i)),
  uint32: (i) => TB.u32.read(i),
  uint32x2: (i) => vec2u(TB.u32.read(i), TB.u32.read(i)),
  uint32x3: (i) => vec3u(TB.u32.read(i), TB.u32.read(i), TB.u32.read(i)),
  uint32x4: (i) => vec4u(TB.u32.read(i), TB.u32.read(i), TB.u32.read(i), TB.u32.read(i)),
  sint32: (i) => TB.i32.read(i),
  sint32x2: (i) => vec2i(TB.i32.read(i), TB.i32.read(i)),
  sint32x3: (i) => vec3i(TB.i32.read(i), TB.i32.read(i), TB.i32.read(i)),
  sint32x4: (i) => vec4i(TB.i32.read(i), TB.i32.read(i), TB.i32.read(i), TB.i32.read(i)),
  'unorm10-10-10-2'(i) {
    const packed = TB.u32.read(i);
    const r = (packed >>> 22) / 1023;
    const g = ((packed >> 12) & 1023) / 1023;
    const b = ((packed >> 2) & 1023) / 1023;
    const a = (packed & 3) / 3;
    return vec4f(r, g, b, a);
  },
  'unorm8x4-bgra'(i) {
    const b = TB.u8.read(i) / 255;
    const g = TB.u8.read(i) / 255;
    const r = TB.u8.read(i) / 255;
    const a = TB.u8.read(i) / 255;
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

    const beginning = input.offset;
    const value = readData(input, schema.inner);
    input.offset = beginning + sizeOf(schema);
    return value;
  },
  // TODO: Move texture IO logic here after we expand repr to have in/out variants
} satisfies CompleteDataReaders;

export function readData<TData extends wgsl.BaseData>(
  input: TB.ByteCursor,
  schema: TData,
): Infer<TData> {
  const reader = (dataReaders as Record<string, unknown>)[schema.type] as DataReader<TData>;
  if (!reader) {
    throw new Error(`Cannot read data of type '${schema.type}'.`);
  }

  return reader(input, schema);
}

const endianness = TB.getSystemEndianness();

export function calculateOffsets<T extends wgsl.BaseData>(
  options: BufferWriteOptions | undefined,
  schema: T,
  data: InferInput<T> | ArrayBuffer | ArrayBufferView,
): { startOffset: number; endOffset: number } {
  const bufferSize = sizeOf(schema);
  const startOffset = options?.startOffset ?? 0;
  let naturalSize: number | undefined = undefined;
  if (wgsl.isWgslArray(schema) && Array.isArray(data)) {
    const arrayData = data as unknown[];
    naturalSize =
      arrayData.length * roundUp(sizeOf(schema.elementType), alignmentOf(schema.elementType));
  } else if (ArrayBuffer.isView(data) || data instanceof ArrayBuffer) {
    naturalSize = data.byteLength;
  }
  const naturalEndOffset =
    naturalSize !== undefined ? Math.min(startOffset + naturalSize, bufferSize) : undefined;

  const endOffset = options?.endOffset ?? naturalEndOffset ?? bufferSize;

  return { startOffset, endOffset };
}

/**
 * A function for filling in buffers with data based on TypeGPU schemas.
 * When schema instances or JS arrays are passed, the padding is applied automatically.
 * ArrayBuffers are expected to be already padded.
 */
export function writeToArrayBuffer<T extends wgsl.BaseData>(
  buffer: ArrayBuffer,
  schema: T,
  data: InferInput<T> | ArrayBuffer | ArrayBufferView,
  options?: BufferWriteOptions,
) {
  const { startOffset, endOffset } = calculateOffsets(options, schema, data);

  // Fast path: raw byte copy, user guarantees the padded layout
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    const src =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const regionSize = endOffset - startOffset;
    if (src.byteLength !== regionSize) {
      logger.warn(
        'suspicious',
        `Buffer size mismatch: expected ${regionSize} bytes, got ${src.byteLength}. ` +
          (src.byteLength < regionSize ? 'Data truncated.' : 'Excess ignored.'),
      );
    }
    const copyLen = Math.min(src.byteLength, regionSize);
    new Uint8Array(buffer).set(src.subarray(0, copyLen), startOffset);
    return;
  }

  const dataView = new DataView(buffer);
  const isLittleEndian = endianness === 'little';

  const compiledWriter = getCompiledWriter(schema);

  if (compiledWriter) {
    try {
      compiledWriter(dataView, startOffset, data, isLittleEndian, endOffset);
      return;
    } catch (error) {
      logger.warn(
        'fallback',
        `Error when using compiled writer for data type '${
          schema.type
        }' (${getName(schema) ?? 'unnamed'}) - this is likely a bug, please submit an issue at https://github.com/software-mansion/TypeGPU/issues\nUsing fallback writer instead.`,
        error,
      );
    }
  }

  writeData({ view: dataView, offset: startOffset, littleEndian: isLittleEndian }, schema, data);
}

export function readFromArrayBuffer<T extends wgsl.BaseData>(
  buffer: ArrayBuffer,
  schema: T,
): Infer<T> {
  return readData(TB.cursor(buffer), schema);
}
