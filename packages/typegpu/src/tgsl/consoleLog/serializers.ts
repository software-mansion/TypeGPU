import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { fn, type TgpuFn } from '../../core/function/tgpuFn.ts';
import { arrayOf } from '../../data/array.ts';
import { u32 } from '../../data/numeric.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { vec3u } from '../../data/vector.ts';
import type {
  AnyWgslData,
  Atomic,
  U32,
  WgslArray,
} from '../../data/wgslTypes.ts';
import type { SerializedLogCallData } from './types.ts';

const serializeU32 = fn([u32], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(n);
}`;

const serializeVec3u = fn([vec3u], arrayOf(u32, 3))`(v) => {
  return array<u32, 3>(v.x, v.y, v.z);
}`;

export const serializers = {
  u32: serializeU32,
  vec3u: serializeVec3u,
} as const;

function generateFor(from: number, size: number, index: number): string {
  return `
    var serializedData_${index} = serializer_${index}(_arg_${index});
    for (var i = ${from}u; i< ${from + size}u; i++) {
      dataBuffer[dataIndex].serializedData[i] = serializedData_${index}[i - ${from}];
    }
`;
}

export function createLoggingFunction(
  id: number,
  args: AnyWgslData[],
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>,
  dataIndexBuffer: TgpuMutable<Atomic<U32>>,
): TgpuFn {
  const usedSerializers: [string, unknown][] = [];
  let currentIndex = 0;
  const innerForLoops = args.map((arg, i) => {
    const serializer = serializers[arg.type as keyof typeof serializers];
    if (!serializer) {
      throw new Error(`Cannot serialize data of type ${arg.type}`);
    }
    usedSerializers.push([`serializer_${i}`, serializer]);
    const size = Math.ceil(sizeOf(arg) / 4);
    const result = generateFor(currentIndex, size, i);
    currentIndex += size;
    return result;
  });
  const uses = Object.fromEntries(usedSerializers);

  return fn(args)`(${args.map((_, i) => `_arg_${i}`).join(', ')}) {
    var dataIndex = atomicAdd(&dataIndexBuffer, 1);
    dataBuffer[dataIndex].id = ${id};

${innerForLoops.join('\n')}
    
  }`.$uses({
    ...uses,
    dataIndexBuffer,
    dataBuffer,
  }).$name(`log data ${id} serializer`);
  // AAA find more fitting names for resources
}
