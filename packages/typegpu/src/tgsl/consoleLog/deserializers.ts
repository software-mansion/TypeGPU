import { sizeOf } from '../../data/sizeOf.ts';
import { vec2u, vec3u, vec4u } from '../../data/vector.ts';
import {
  type AnyWgslData,
  isVecInstance,
  isWgslData,
} from '../../data/wgslTypes.ts';
import { Infer } from '../../shared/repr.ts';
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

function stringify(data: unknown): string {
  if (isVecInstance(data)) {
    return `${data.kind}(${data.join(', ')})`;
  }
  return `${data}`;
}

function deserialize(
  data: number[],
  logInfo: (AnyWgslData | string)[],
): unknown[] {
  let currentIndex = 0;
  return logInfo.map((elem) => {
    if (isWgslData(elem)) {
      const type = elem.type;
      const deserializer = deserializerMap[type];
      if (!deserializer) {
        throw new Error(`Cannot deserialize data of type ${type}`);
      }
      const size = Math.ceil(sizeOf(elem) / 4);
      const slice = data.slice(currentIndex, currentIndex + size);
      currentIndex += size;
      return deserializer(slice);
    }
    return elem;
  });
}

export function deserializeAndStringify(
  serializedData: number[],
  argTypes: (AnyWgslData | string)[],
): string {
  return deserialize(serializedData, argTypes).map(stringify).join(' ');
}

export function logDataFromGPU(resources: LogResources) {
  const {
    logCallIndexBuffer,
    serializedLogDataBuffer,
    logIdToArgTypes,
    options,
  } = resources;

  serializedLogDataBuffer.read().then((data) => {
    data
      .filter((e) => e.id)
      .map(({ id, serializedData }) => {
        const argTypes = logIdToArgTypes
          .get(id) as (AnyWgslData | string)[];
        const result = deserializeAndStringify(serializedData, argTypes);
        console.log(`${options.messagePrefix}${result}`);
      });
  });

  logCallIndexBuffer.read().then((totalCalls) => {
    if (totalCalls > options.logCountLimit) {
      console.warn(
        `Log count limit per dispatch (${options.logCountLimit}) exceeded by ${
          totalCalls - options.logCountLimit
        } calls. Consider increasing the limit by passing appropriate options to tgpu.init().`,
      );
    }
  });
}
