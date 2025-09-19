import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { fn, type TgpuFn } from '../../core/function/tgpuFn.ts';
import { privateVar } from '../../core/variable/tgpuVariable.ts';
import { u32 } from '../../data/numeric.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import { vec3u } from '../../data/vector.ts';
import {
  AnyWgslData,
  Atomic,
  U32,
  Void,
  WgslArray,
} from '../../data/wgslTypes.ts';
import type { LogGeneratorOptions, SerializedLogCallData } from './types.ts';

// --------------
// Serializer map
// --------------

type SerializerMap = {
  [K in AnyWgslData['type']]?: TgpuFn<
    (args_0: Extract<AnyWgslData, { type: K }>) => Void
  >;
};

const dataBlockIndex = privateVar(u32, 0);
const dataByteIndex = privateVar(u32, 0);

const nextByteIndex = fn([], u32)`() {
  let i = dataByteIndex;
  dataByteIndex = dataByteIndex + 1u;
  return i;
}`.$uses({ dataByteIndex });

export const serializerMap: SerializerMap = {
  //   f32: fn([f32], arrayOf(u32, 1))`(n) => {
  //   return array<u32, 1>(bitcast<u32>(n));
  // }`,
  //   f16: fn([f16], arrayOf(u32, 1))`(n) => {
  //   return array<u32, 1>(pack2x16float(vec2f(f32(n))));
  // }`,
  //   i32: fn([i32], arrayOf(u32, 1))`(n) => {
  //   return array<u32, 1>(bitcast<u32>(n));
  // }`,
  u32: fn([u32], Void)`(n) => {
  dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = n;
}`,
  //   bool: fn([bool], arrayOf(u32, 1))`(b) => {
  //   return array<u32, 1>(u32(b));
  // }`,
  //   vec2f: fn([vec2f], arrayOf(u32, 2))`(v) => {
  //   return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
  // }`,
  //   vec3f: fn([vec3f], arrayOf(u32, 3))`(v) => {
  //   return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
  // }`,
  //   vec4f: fn([vec4f], arrayOf(u32, 4))`(v) => {
  //   return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
  // }`,
  //   vec2h: fn([vec2h], arrayOf(u32, 1))`(v) => {
  //   return array<u32, 1>(pack2x16float(vec2f(f32(v.x), f32(v.y))));
  // }`,
  //   vec3h: fn([vec3h], arrayOf(u32, 2))`(v) => {
  //   return array<u32, 2>(
  //     pack2x16float(vec2f(f32(v.x), f32(v.y))),
  //     pack2x16float(vec2f(f32(v.z), 0))
  //   );
  // }`,
  //   vec4h: fn([vec4h], arrayOf(u32, 2))`(v) => {
  //   return array<u32, 2>(
  //     pack2x16float(vec2f(f32(v.x), f32(v.y))),
  //     pack2x16float(vec2f(f32(v.z), f32(v.w)))
  //   );
  // }`,
  //   vec2i: fn([vec2i], arrayOf(u32, 2))`(v) => {
  //   return array<u32, 2>(bitcast<u32>(v.x), bitcast<u32>(v.y));
  // }`,
  //   vec3i: fn([vec3i], arrayOf(u32, 3))`(v) => {
  //   return array<u32, 3>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z));
  // }`,
  //   vec4i: fn([vec4i], arrayOf(u32, 4))`(v) => {
  //   return array<u32, 4>(bitcast<u32>(v.x), bitcast<u32>(v.y), bitcast<u32>(v.z), bitcast<u32>(v.w));
  // }`,
  //   vec2u: fn([vec2u], arrayOf(u32, 2))`(v) => {
  //   return array<u32, 2>(v.x, v.y);
  // }`,
  vec3u: fn([vec3u])`(v) => {
  dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.x;
  dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.y;
  dataBuffer[dataBlockIndex].serializedData[nextByteIndex()] = v.z;
}`,
  //   vec4u: fn([vec4u], arrayOf(u32, 4))`(v) => {
  //   return array<u32, 4>(v.x, v.y, v.z, v.w);
  // }`,
  //   'vec2<bool>': fn([vec2b], arrayOf(u32, 2))`(v) => {
  //   return array<u32, 2>(u32(v.x), u32(v.y));
  // }`,
  //   'vec3<bool>': fn([vec3b], arrayOf(u32, 3))`(v) => {
  //   return array<u32, 3>(u32(v.x), u32(v.y), u32(v.z));
  // }`,
  //   'vec4<bool>': fn([vec4b], arrayOf(u32, 4))`(v) => {
  //   return array<u32, 4>(u32(v.x), u32(v.y), u32(v.z), u32(v.w));
  // }`,
  //   mat2x2f: fn([mat2x2f], arrayOf(u32, 4))`(m) => {
  //   return array<u32, 4>(
  //     bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]),
  //     bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1])
  //   );
  // }`,
  //   mat3x3f: fn([mat3x3f], arrayOf(u32, 12))`(m) => {
  //   return array<u32, 12>(
  //     bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), 0,
  //     bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), 0,
  //     bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), 0
  //   );
  // }`,
  //   mat4x4f: fn([mat4x4f], arrayOf(u32, 16))`(m) => {
  //   return array<u32, 16>(
  //     bitcast<u32>(m[0][0]), bitcast<u32>(m[0][1]), bitcast<u32>(m[0][2]), bitcast<u32>(m[0][3]),
  //     bitcast<u32>(m[1][0]), bitcast<u32>(m[1][1]), bitcast<u32>(m[1][2]), bitcast<u32>(m[1][3]),
  //     bitcast<u32>(m[2][0]), bitcast<u32>(m[2][1]), bitcast<u32>(m[2][2]), bitcast<u32>(m[2][3]),
  //     bitcast<u32>(m[3][0]), bitcast<u32>(m[3][1]), bitcast<u32>(m[3][2]), bitcast<u32>(m[3][3])
  //   );
  // }`,
};

// rename the functions and add externals
// (except for the `dataBuffer` since it is not known yet)
for (const [name, serializer] of Object.entries(serializerMap)) {
  serializer.$name(
    `serialize${(name[0] as string).toLocaleUpperCase()}${name.slice(1)}`,
  ).$uses({ dataBlockIndex, nextByteIndex });
}

// -------
// Helpers
// -------

function generateHeader(argTypes: AnyWgslData[]): string {
  return `(${argTypes.map((_, i) => `_arg_${i}`).join(', ')})`;
}

function createCompoundSerializer(
  argTypes: AnyWgslData[],
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>,
) {
  const usedSerializers: Record<string, unknown> = {};

  const shell = fn(argTypes);
  const header = `(${argTypes.map((_, i) => `_arg_${i}`).join(', ')})`;
  const body = argTypes.map((arg, i) => {
    const serializer = serializerMap[arg.type];
    if (!serializer) {
      throw new Error(`Cannot serialize data of type ${arg.type}`);
    }
    usedSerializers[`serializer${i}`] = serializer.$uses({ dataBuffer });
    return `  serializer${i}(_arg_${i});`;
  }).join('\n');

  return shell`${header} {\n${body}\n}`.$uses(usedSerializers);
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

  const compoundSerializer = createCompoundSerializer(argTypes, dataBuffer);
  const args = `${argTypes.map((_, i) => `_arg_${i}`).join(', ')}`;

  return fn(argTypes)`(${args}) {
  dataBlockIndex = atomicAdd(&indexBuffer, 1);
  if (dataBlockIndex >= ${logOptions.logCountLimit}) {
    return;
  }
  dataBuffer[dataBlockIndex].id = ${id};
  dataByteIndex = 0;

  compoundSerializer(${args});
}`.$uses({
      indexBuffer,
      dataBuffer,
      dataBlockIndex,
      dataByteIndex,
      compoundSerializer,
    }).$name(`log${id}`);
}
