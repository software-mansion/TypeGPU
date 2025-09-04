import { sizeOf } from '../../data/sizeOf.ts';
import { vec3u } from '../../data/vector.ts';
import {
  type AnyWgslData,
  isVecInstance,
  isWgslData,
} from '../../data/wgslTypes.ts';
import { LogResources } from './types.ts';

const deserializeU32 = (data: number[]) => data[0] ?? 0;

const deserializeVec3u = (
  data: number[],
) => vec3u(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);

const deserializers = {
  u32: deserializeU32,
  vec3u: deserializeVec3u,
} as const;

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
      const deserializer = deserializers[type as keyof typeof deserializers];
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
    if (totalCalls > options.logCountPerDispatchLimit) {
      console.warn(
        `Log count limit per dispatch (${options.logCountPerDispatchLimit}) exceeded by ${
          totalCalls - options.logCountPerDispatchLimit
        } calls. Consider increasing it by passing appropriate options to tgpu.init().`,
      );
    }
  });
}
