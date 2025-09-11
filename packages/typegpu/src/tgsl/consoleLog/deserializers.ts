import { sizeOf } from '../../data/sizeOf.ts';
import { vec2u, vec3u, vec4u } from '../../data/vector.ts';
import { type AnyWgslData, isWgslData } from '../../data/wgslTypes.ts';
import type { Infer } from '../../shared/repr.ts';
import type { LogResources } from './types.ts';

// -------------
// Deserializers
// -------------

const deserializeBool = (data: number[]) => !!data[0];

const deserializeU32 = (data: number[]) => data[0] ?? 0;

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
  u32: deserializeU32,
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
}
