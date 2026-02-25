import { mat2x2f, mat3x3f, mat4x4f } from '../../data/matrix.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../../data/vector.ts';
import {
  type AnyWgslData,
  type BaseData,
  isWgslArray,
  isWgslData,
  isWgslStruct,
} from '../../data/wgslTypes.ts';
import type { Infer } from '../../shared/repr.ts';
import { niceStringify } from '../../shared/stringify.ts';
import { bitcastU32toF32, bitcastU32toI32 } from '../../std/bitcast.ts';
import { unpack2x16float } from '../../std/packing.ts';
import type { LogMeta, LogResources } from './types.ts';

const toF = (n: number | undefined) => bitcastU32toF32(n ?? 0);
const toI = (n: number | undefined) => bitcastU32toI32(n ?? 0);
const unpack = (n: number | undefined) => unpack2x16float(n ?? 0);

// ----------------
// Deserializer map
// ----------------

type DeserializerMap = {
  [K in AnyWgslData['type']]?: (
    data: Uint32Array,
  ) => Infer<Extract<AnyWgslData, { type: K }>>;
};

const deserializerMap: DeserializerMap = {
  f32: (d: Uint32Array) => toF(d[0]),
  f16: (d: Uint32Array) => unpack(d[0]).x,
  i32: (d: Uint32Array) => toI(d[0]),
  u32: (d: Uint32Array) => d[0] ?? 0,
  bool: (d: Uint32Array) => !!d[0],
  vec2f: (d: Uint32Array) => vec2f(toF(d[0]), toF(d[1])),
  vec3f: (d: Uint32Array) => vec3f(toF(d[0]), toF(d[1]), toF(d[2])),
  vec4f: (d: Uint32Array) => vec4f(toF(d[0]), toF(d[1]), toF(d[2]), toF(d[3])),
  vec2h(d: Uint32Array) {
    const xyVec = unpack(d[0]);
    return vec2h(xyVec.x, xyVec.y);
  },
  vec3h(d: Uint32Array) {
    const xyVec = unpack(d[0]);
    const zVec = unpack(d[1]);
    return vec3h(xyVec.x, xyVec.y, zVec.x);
  },
  vec4h(d: Uint32Array) {
    const xyVec = unpack(d[0]);
    const zwVec = unpack(d[1]);
    return vec4h(xyVec.x, xyVec.y, zwVec.x, zwVec.y);
  },
  vec2i: (d: Uint32Array) => vec2i(toI(d[0]), toI(d[1])),
  vec3i: (d: Uint32Array) => vec3i(toI(d[0]), toI(d[1]), toI(d[2])),
  vec4i: (d: Uint32Array) => vec4i(toI(d[0]), toI(d[1]), toI(d[2]), toI(d[3])),
  vec2u: (d: Uint32Array) => vec2u(d[0] ?? 0, d[1] ?? 0),
  vec3u: (d: Uint32Array) => vec3u(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0),
  vec4u: (d: Uint32Array) => vec4u(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0),
  'vec2<bool>': (d: Uint32Array) => vec2b(!!d[0], !!d[1]),
  'vec3<bool>': (d: Uint32Array) => vec3b(!!d[0], !!d[1], !!d[2]),
  'vec4<bool>': (d: Uint32Array) => vec4b(!!d[0], !!d[1], !!d[2], !!d[3]),
  mat2x2f: (d: Uint32Array) =>
    mat2x2f(toF(d[0]), toF(d[1]), toF(d[2]), toF(d[3])),
  mat3x3f: (d: Uint32Array) =>
    // oxfmt-ignore
    mat3x3f(
      toF(d[0]), toF(d[1]), toF(d[2]),
      toF(d[4]), toF(d[5]), toF(d[6]),
      toF(d[8]), toF(d[9]), toF(d[10]),
    ),
  mat4x4f: (d: Uint32Array) =>
    // oxfmt-ignore
    mat4x4f(
      toF(d[0]),  toF(d[1]),  toF(d[2]),  toF(d[3]),
      toF(d[4]),  toF(d[5]),  toF(d[6]),  toF(d[7]),
      toF(d[8]),  toF(d[9]),  toF(d[10]), toF(d[11]),
      toF(d[12]), toF(d[13]), toF(d[14]), toF(d[15]),
    ),
};

// -------
// Helpers
// -------

/**
 * Deserializes binary data from a Uint32Array into a JavaScript value based on the provided WGSL data type.
 *
 * @param data - The binary data as a Uint32Array to be deserialized
 * @param dataType - The WGSL data type specification that determines how to interpret the binary data
 */
function deserialize(
  data: Uint32Array,
  dataType: BaseData,
): unknown {
  const maybeDeserializer =
    deserializerMap[dataType.type as AnyWgslData['type']];
  if (maybeDeserializer) {
    return maybeDeserializer(data);
  }
  if (isWgslStruct(dataType)) {
    const props = Object.keys(dataType.propTypes);
    const propTypes = Object.values(dataType.propTypes);
    const decodedProps = deserializeCompound(data, propTypes);
    return Object.fromEntries(
      props.map((key, index) => [key, decodedProps[index]]),
    );
  }
  if (isWgslArray(dataType)) {
    const elementType = dataType.elementType as AnyWgslData;
    const length = dataType.elementCount;
    const result = deserializeCompound(
      data,
      Array.from({ length }, () => elementType),
    );
    return result;
  }

  throw new Error(`Cannot deserialize data of type ${dataType.type}`);
}

/**
 * Deserializes a list of elements from a Uint32Array buffer using provided type information.
 * If there is a string value among the type information, it is returned as is.
 *
 * @param data - The Uint32Array buffer containing the serialized data
 * @param dataTypes - The WGSL data type specification that determines how to interpret the binary data, or string literals
 */
function deserializeCompound(
  data: Uint32Array,
  dataTypes: (BaseData | string)[],
): unknown[] {
  let index = 0;
  return dataTypes.map((info) => {
    if (!isWgslData(info)) {
      return info;
    }
    const size = Math.ceil(sizeOf(info) / 4);
    const value = deserialize(data.subarray(index, index + size), info);
    index += size;
    return value;
  });
}

export function deserializeAndStringify(
  serializedData: Uint32Array,
  argTypes: (AnyWgslData | string)[],
): string[] {
  return deserializeCompound(serializedData, argTypes)
    .map(niceStringify);
}

/**
 * Reads and deserializes log data from GPU buffers, logging results to the console.
 *
 * @remarks
 * - Log entries with IDs equal to 0 are filtered out.
 * - Console messages are prepended with options.messagePrefix styled with purple background and white text.
 * - A warning is displayed if the log count exceeds the limit passed in options.
 * - After processing, the index buffer and the data buffer are cleared.
 */
export function logDataFromGPU(resources: LogResources) {
  const { indexBuffer, dataBuffer, logIdToMeta, options } = resources;

  void dataBuffer.read().then((data) => {
    data
      .filter((e) => e.id)
      .forEach(({ id, serializedData }) => {
        const { argTypes, op } = logIdToMeta.get(id) as LogMeta;
        const results = deserializeAndStringify(
          new Uint32Array(serializedData),
          argTypes,
        );
        if (results.length === 0) {
          results.push('');
        }
        console[op](
          `%c${options.messagePrefix}%c ${results[0]}`,
          'background: #936ff5; color: white;',
          'color: inherit; background: none',
          ...results.slice(1),
        );
      });
  });

  void indexBuffer.read().then((totalCalls) => {
    if (totalCalls > options.logCountLimit) {
      console.warn(
        `Log count limit per dispatch (${options.logCountLimit}) exceeded by ${
          totalCalls - options.logCountLimit
        } calls. Consider increasing the limit by passing appropriate options to tgpu.init().`,
      );
    }
  });

  dataBuffer.buffer.clear();
  indexBuffer.buffer.clear();
}
