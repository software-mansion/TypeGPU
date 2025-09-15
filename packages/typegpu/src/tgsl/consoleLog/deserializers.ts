import { sizeOf } from '../../data/sizeOf.ts';
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
} from '../../data/vector.ts';
import { type AnyWgslData, isWgslData } from '../../data/wgslTypes.ts';
import type { Infer } from '../../shared/repr.ts';
import { bitcastU32toF32, bitcastU32toI32 } from '../../std/bitcast.ts';
import type { LogResources } from './types.ts';

// -------------
// Deserializers
// -------------

const deserializeBool = (data: number[]) => !!data[0];

const deserializeF32 = (data: number[]) => bitcastU32toF32(data[0] ?? 0);

const deserializeI32 = (data: number[]) => bitcastU32toI32(data[0] ?? 0);

const deserializeU32 = (data: number[]) => data[0] ?? 0;

const deserializeVec2f = (
  data: number[],
) =>
  vec2f(
    bitcastU32toF32(data[0] ?? 0),
    bitcastU32toF32(data[1] ?? 0),
  );

const deserializeVec3f = (
  data: number[],
) =>
  vec3f(
    bitcastU32toF32(data[0] ?? 0),
    bitcastU32toF32(data[1] ?? 0),
    bitcastU32toF32(data[2] ?? 0),
  );

const deserializeVec4f = (
  data: number[],
) =>
  vec4f(
    bitcastU32toF32(data[0] ?? 0),
    bitcastU32toF32(data[1] ?? 0),
    bitcastU32toF32(data[2] ?? 0),
    bitcastU32toF32(data[3] ?? 0),
  );

const deserializeVec2i = (
  data: number[],
) =>
  vec2i(
    bitcastU32toI32(data[0] ?? 0),
    bitcastU32toI32(data[1] ?? 0),
  );

const deserializeVec3i = (
  data: number[],
) =>
  vec3i(
    bitcastU32toI32(data[0] ?? 0),
    bitcastU32toI32(data[1] ?? 0),
    bitcastU32toI32(data[2] ?? 0),
  );

const deserializeVec4i = (
  data: number[],
) =>
  vec4i(
    bitcastU32toI32(data[0] ?? 0),
    bitcastU32toI32(data[1] ?? 0),
    bitcastU32toI32(data[2] ?? 0),
    bitcastU32toI32(data[3] ?? 0),
  );

const deserializeVec2u = (
  data: number[],
) => vec2u(data[0] ?? 0, data[1] ?? 0);

const deserializeVec3u = (
  data: number[],
) => vec3u(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);

const deserializeVec4u = (
  data: number[],
) => vec4u(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0, data[3] ?? 0);

// ----------------
// Deserializer map
// ----------------

type DeserializerMap = {
  [K in AnyWgslData['type']]?: (
    data: number[],
  ) => Infer<Extract<AnyWgslData, { type: K }>>;
};

const deserializerMap: DeserializerMap = {
  bool: deserializeBool,
  f32: deserializeF32,
  i32: deserializeI32,
  u32: deserializeU32,
  vec2f: deserializeVec2f,
  vec3f: deserializeVec3f,
  vec4f: deserializeVec4f,
  vec2i: deserializeVec2i,
  vec3i: deserializeVec3i,
  vec4i: deserializeVec4i,
  vec2u: deserializeVec2u,
  vec3u: deserializeVec3u,
  vec4u: deserializeVec4u,
};

// -------
// Helpers
// -------

function deserialize(
  data: number[],
  logInfo: (AnyWgslData | string)[],
): unknown[] {
  let index = 0;
  return logInfo.map((info) => {
    if (!isWgslData(info)) {
      return info;
    }
    const deserializer = deserializerMap[info.type];
    if (!deserializer) {
      throw new Error(`Cannot deserialize data of type ${info.type}`);
    }
    const size = Math.ceil(sizeOf(info) / 4);
    const value = deserializer(data.slice(index, index + size));
    index += size;
    return value;
  });
}

export function deserializeAndStringify(
  serializedData: number[],
  argTypes: (AnyWgslData | string)[],
): string {
  return deserialize(serializedData, argTypes).join(' ');
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
  const {
    indexBuffer,
    dataBuffer,
    logIdToArgTypes,
    options,
  } = resources;

  dataBuffer.read().then((data) => {
    data
      .filter((e) => e.id)
      .map(({ id, serializedData }) => {
        const argTypes = logIdToArgTypes.get(id) as (AnyWgslData | string)[];
        const result = deserializeAndStringify(serializedData, argTypes);
        console.log(
          `${options.messagePrefix}${result}`,
          'background: #936ff5; color: white;',
          '',
        );
      });
  });

  indexBuffer.read().then((totalCalls) => {
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
