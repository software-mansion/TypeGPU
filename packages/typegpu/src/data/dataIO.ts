import type { ISerialInput, ISerialOutput } from 'typed-binary';
import type { Infer, InferRecord } from '../shared/repr';
import alignIO from './alignIO';
import {
  type AnyWgslData,
  type Bool,
  type F32,
  type I32,
  type U32,
  type Vec3f,
  type WgslStruct,
  alignmentOfData,
  type vec3f,
} from './dataTypes';
import { vec3f as createVec3f } from './vector';

type CompleteDataWriters = {
  [TType in AnyWgslData['type']]: (
    output: ISerialOutput,
    schema: Extract<AnyWgslData, { readonly type: TType }>,
    value: Infer<Extract<AnyWgslData, { readonly type: TType }>>,
  ) => void;
};

type CompleteDataReaders = {
  [TType in AnyWgslData['type']]: (
    input: ISerialInput,
    schema: Extract<AnyWgslData, { readonly type: TType }>,
  ) => Infer<Extract<AnyWgslData, { readonly type: TType }>>;
};

export const dataWriters = {
  bool(output: ISerialOutput, _schema: Bool, value: boolean) {
    output.writeBool(value);
  },

  f32(output: ISerialOutput, _schema: F32, value: number) {
    output.writeFloat32(value);
  },

  i32(output: ISerialOutput, _schema: I32, value: number) {
    output.writeInt32(value);
  },

  u32(output: ISerialOutput, _schema: U32, value: number) {
    output.writeUint32(value);
  },

  vec3f(output: ISerialOutput, _schema: Vec3f, value: vec3f) {
    output.writeFloat32(value.x);
    output.writeFloat32(value.y);
    output.writeFloat32(value.z);
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

  array(output, schema, value) {
    alignIO(output, schema.alignment);
    const beginning = output.currentByteOffset;
    for (let i = 0; i < Math.min(schema.length, value.length); i++) {
      alignIO(output, schema.alignment);
      const elementType = schema.elementType as AnyWgslData;
      dataWriters[elementType?.type]?.(output, elementType, value[i]);
    }
    output.seekTo(beginning + schema.size);
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

  vec3f(input: ISerialInput) {
    return createVec3f(
      input.readFloat32(),
      input.readFloat32(),
      input.readFloat32(),
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
    return result as InferRecord<Record<string, unknown>>;
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
} satisfies CompleteDataReaders as Record<
  string,
  (input: ISerialInput, schema: unknown) => unknown
>;
