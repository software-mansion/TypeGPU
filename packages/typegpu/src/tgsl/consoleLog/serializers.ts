import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { fn, type TgpuFn } from '../../core/function/tgpuFn.ts';
import { arrayOf } from '../../data/array.ts';
import { bool, f32, i32, u32 } from '../../data/numeric.ts';
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

const serializeF32 = fn([f32], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(bitcast<u32>(n));
}`;

const serializeI32 = fn([i32], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(bitcast<u32>(n));
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
  f32: serializeF32,
  i32: serializeI32,
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
    `  var serializedData${index} = serializer${index}(_arg_${index});`;

  const copyInstructions = [...Array(size).keys()].map((i) =>
    `  dataBuffer[index].serializedData[${
      from + i
    }] = serializedData${index}[${i}];`
  );

  return [serializedDataDecl, ...copyInstructions].join('\n');
}

export function createLoggingFunction(
  id: number,
  argTypes: AnyWgslData[],
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>,
  indexBuffer: TgpuMutable<Atomic<U32>>,
  logOptions: Required<LogGeneratorOptions>,
): TgpuFn {
  const serializedSize = argTypes.map(sizeOf).reduce((a, b) => a + b, 0);
  if (serializedSize > logOptions.logSizeLimit) {
    throw new Error(
      `Logged data needs to fit in ${logOptions.logSizeLimit} bytes (one of the logs requires ${serializedSize} bytes). Consider increasing the limit by passing appropriate options to tgpu.init().`,
    );
  }

  const usedSerializers: Record<string, unknown> = {};
  let index = 0;
  const innerForLoops = argTypes.map((arg, i) => {
    const serializer = serializerMap[arg.type];
    if (!serializer) {
      throw new Error(`Cannot serialize data of type ${arg.type}`);
    }
    usedSerializers[`serializer${i}`] = serializer;
    const size = Math.ceil(sizeOf(arg) / 4);
    const instructions = generateDataCopyingInstructions(index, size, i);
    index += size;
    return instructions;
  });

  return fn(argTypes)`(${argTypes.map((_, i) => `_arg_${i}`).join(', ')}) {
  var index = atomicAdd(&indexBuffer, 1);
  if (index >= ${logOptions.logCountLimit}) {
    return;
  }
  dataBuffer[index].id = ${id};

${innerForLoops.join('\n')}
}`.$uses({
      ...usedSerializers,
      indexBuffer: indexBuffer,
      dataBuffer: dataBuffer,
    }).$name(`log${id}`);
}
