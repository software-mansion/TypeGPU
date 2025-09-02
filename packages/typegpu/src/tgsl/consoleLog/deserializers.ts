import { sizeOf } from '../../data/sizeOf.ts';
import { vec3u } from '../../data/vector.ts';
import {
  type AnyWgslData,
  isVecInstance,
  isWgslData,
} from '../../data/wgslTypes.ts';

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
