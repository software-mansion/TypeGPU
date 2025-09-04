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

function generateDataCopyingInstructions(
  from: number,
  size: number,
  index: number,
): string {
  const serializedDataDecl =
    `  var serializedData${index} = serializer${index}(_arg_${index});\n`;

  const copyInstructions = Array(size).keys().map((i) =>
    `  serializedLogDataBuffer[index].serializedData[${
      from + i
    }] = serializedData${index}[${i}];\n`
  );

  return [serializedDataDecl, ...copyInstructions].join('');
}

export function createLoggingFunction(
  id: number,
  args: AnyWgslData[],
  serializedLogDataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>,
  logCallIndexBuffer: TgpuMutable<Atomic<U32>>,
  logCountPerDispatchLimit: number,
): TgpuFn {
  const usedSerializers: [string, unknown][] = [];
  let currentIndex = 0;
  const innerForLoops = args.map((arg, i) => {
    const serializer = serializers[arg.type as keyof typeof serializers];
    if (!serializer) {
      throw new Error(`Cannot serialize data of type ${arg.type}`);
    }
    usedSerializers.push([`serializer${i}`, serializer]);
    const size = Math.ceil(sizeOf(arg) / 4);
    const result = generateDataCopyingInstructions(currentIndex, size, i);
    currentIndex += size;
    return result;
  });
  const uses = Object.fromEntries(usedSerializers);

  return fn(args)`(${args.map((_, i) => `_arg_${i}`).join(', ')}) {
  var index = atomicAdd(&logCallIndexBuffer, 1);
  if (index >= ${logCountPerDispatchLimit}) {
    return;
  }
  serializedLogDataBuffer[index].id = ${id};

${innerForLoops.join('\n')}}`
    .$uses({
      ...uses,
      logCallIndexBuffer,
      serializedLogDataBuffer,
    }).$name(`log${id}`);
}
