import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { fn, type TgpuFn } from '../../core/function/tgpuFn.ts';
import { arrayOf } from '../../data/array.ts';
import { bool, u32 } from '../../data/numeric.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { vec2u, vec3u, vec4u } from '../../data/vector.ts';
import type {
  AnyWgslData,
  Atomic,
  U32,
  WgslArray,
} from '../../data/wgslTypes.ts';
import type { LogGeneratorOptions, SerializedLogCallData } from './types.ts';

// -----------
// Serializers
// -----------

const serializeBool = fn([bool], arrayOf(u32, 1))`(b) => {
  return array<u32, 1>(u32(b));
}`;

const serializeU32 = fn([u32], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(n);
}`;

const serializeVec2u = fn([vec2u], arrayOf(u32, 2))`(v) => {
  return array<u32, 2>(v.x, v.y);
}`;

const serializeVec3u = fn([vec3u], arrayOf(u32, 3))`(v) => {
  return array<u32, 3>(v.x, v.y, v.z);
}`;

const serializeVec4u = fn([vec4u], arrayOf(u32, 4))`(v) => {
  return array<u32, 4>(v.x, v.y, v.z, v.w);
}`;

// --------------
// Serializer map
// --------------

type SerializerMap = {
  [K in AnyWgslData['type']]?: TgpuFn<
    (args_0: Extract<AnyWgslData, { type: K }>) => WgslArray<U32>
  >;
};

export const serializerMap: SerializerMap = {
  bool: serializeBool,
  u32: serializeU32,
  vec2u: serializeVec2u,
  vec3u: serializeVec3u,
  vec4u: serializeVec4u,
};

// -------
// Helpers
// -------

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
  logOptions: Required<LogGeneratorOptions>,
): TgpuFn {
  const serializedSize = args.map(sizeOf).reduce((a, b) => a + b, 0);
  if (serializedSize > logOptions.serializedLogDataSizeLimit) {
    throw new Error(
      `Logged data needs to fit in ${logOptions.serializedLogDataSizeLimit} bytes (one of the logs requires ${serializedSize} bytes). Consider increasing the limit by passing appropriate options to tgpu.init().`,
    );
  }

  const usedSerializers: [string, unknown][] = [];
  let currentIndex = 0;
  const innerForLoops = args.map((arg, i) => {
    const serializer = serializerMap[arg.type];
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
  if (index >= ${logOptions.logCountPerDispatchLimit}) {
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
