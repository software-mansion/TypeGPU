import { sizeOf } from '../../data/sizeOf.ts';
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
} from '../../data/vector.ts';
import { type AnyWgslData, isWgslData } from '../../data/wgslTypes.ts';
import type { Infer } from '../../shared/repr.ts';
import { bitcastU32toF32, bitcastU32toI32 } from '../../std/bitcast.ts';
import { unpack2x16float } from '../../std/packing.ts';
import type { LogResources } from './types.ts';

const toF = (n: number | undefined) => bitcastU32toF32(n ?? 0);
const toI = (n: number | undefined) => bitcastU32toI32(n ?? 0);
const unpack = (n: number | undefined) => unpack2x16float(n ?? 0);

// ----------------
// Deserializer map
// ----------------

type DeserializerMap = {
  [K in AnyWgslData['type']]?: (
    data: number[],
  ) => Infer<Extract<AnyWgslData, { type: K }>>;
};

const deserializerMap: DeserializerMap = {
  bool: (d: number[]) => !!d[0],
  f32: (d: number[]) => toF(d[0]),
  f16: (d: number[]) => unpack(d[0]).x,
  i32: (d: number[]) => toI(d[0]),
  u32: (d: number[]) => d[0] ?? 0,
  vec2f: (d: number[]) => vec2f(toF(d[0]), toF(d[1])),
  vec3f: (d: number[]) => vec3f(toF(d[0]), toF(d[1]), toF(d[2])),
  vec4f: (d: number[]) => vec4f(toF(d[0]), toF(d[1]), toF(d[2]), toF(d[3])),
  vec2h(d: number[]) {
    const xyVec = unpack(d[0]);
    return vec2h(xyVec.x, xyVec.y);
  },
  vec3h(d: number[]) {
    const xyVec = unpack(d[0]);
    const z = unpack(d[1]);
    return vec3h(xyVec.x, xyVec.y, z.x);
  },
  vec4h(d: number[]) {
    const xyVec = unpack(d[0]);
    const zwVec = unpack(d[1]);
    return vec4h(xyVec.x, xyVec.y, zwVec.x, zwVec.y);
  },
  vec2i: (d: number[]) => vec2i(toI(d[0]), toI(d[1])),
  vec3i: (d: number[]) => vec3i(toI(d[0]), toI(d[1]), toI(d[2])),
  vec4i: (d: number[]) => vec4i(toI(d[0]), toI(d[1]), toI(d[2]), toI(d[3])),
  vec2u: (d: number[]) => vec2u(d[0] ?? 0, d[1] ?? 0),
  vec3u: (d: number[]) => vec3u(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0),
  vec4u: (d: number[]) => vec4u(d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, d[3] ?? 0),
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
