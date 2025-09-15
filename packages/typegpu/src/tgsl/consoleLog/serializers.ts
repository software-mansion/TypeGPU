import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { fn, type TgpuFn } from '../../core/function/tgpuFn.ts';
import { arrayOf } from '../../data/array.ts';
import { bool, f16, f32, i32, u32 } from '../../data/numeric.ts';
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

const serializeF16 = fn([f16], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(pack2x16float(vec2f(f32(n))));
}`;

const serializeI32 = fn([i32], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(bitcast<u32>(n));
}`;

const serializeU32 = fn([u32], arrayOf(u32, 1))`(n) => {
  return array<u32, 1>(n);
}`;

const serializeVec2f = fn([vec2f], arrayOf(u32, 2))`(v) => {
  return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
}`;

const serializeVec3f = fn([vec3f], arrayOf(u32, 3))`(v) => {
  return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
}`;

const serializeVec4f = fn([vec4f], arrayOf(u32, 4))`(v) => {
  return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
}`;

const serializeVec2h = fn([vec2h], arrayOf(u32, 1))`(v) => {
  return array<u32, 1>(pack2x16float(vec2f(f32(v.x), f32(v.y))));
}`;

const serializeVec3h = fn([vec3h], arrayOf(u32, 2))`(v) => {
  return array<u32, 2>(
    pack2x16float(vec2f(f32(v.x), f32(v.y))),
    pack2x16float(vec2f(f32(v.z), 0))
  );
}`;

const serializeVec4h = fn([vec4h], arrayOf(u32, 2))`(v) => {
  return array<u32, 2>(
    pack2x16float(vec2f(f32(v.x), f32(v.y))),
    pack2x16float(vec2f(f32(v.z), f32(v.w)))
  );
}`;

const serializeVec2i = fn([vec2i], arrayOf(u32, 2))`(v) => {
  return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
}`;

const serializeVec3i = fn([vec3i], arrayOf(u32, 3))`(v) => {
  return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
}`;

const serializeVec4i = fn([vec4i], arrayOf(u32, 4))`(v) => {
  return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
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
  f16: serializeF16,
  i32: serializeI32,
  u32: serializeU32,
  vec2f: serializeVec2f,
  vec3f: serializeVec3f,
  vec4f: serializeVec4f,
  vec2h: serializeVec2h,
  vec3h: serializeVec3h,
  vec4h: serializeVec4h,
  vec2i: serializeVec2i,
  vec3i: serializeVec3i,
  vec4i: serializeVec4i,
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
