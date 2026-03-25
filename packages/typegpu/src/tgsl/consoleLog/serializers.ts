import type { TgpuMutable } from '../../core/buffer/bufferShorthand.ts';
import { fn, type TgpuFn } from '../../core/function/tgpuFn.ts';
import { slot } from '../../core/slot/slot.ts';
import { privateVar } from '../../core/variable/tgpuVariable.ts';
import type { AnyData } from '../../data/dataTypes.ts';
import { mat2x2f, mat3x3f, mat4x4f } from '../../data/matrix.ts';
import { bool, f16, f32, i32, u32 } from '../../data/numeric.ts';
import { sizeOf } from '../../data/sizeOf.ts';
import {
  vec2b,
  vec2f,
  vec2h,
  vec2i,
  vec2u,
  vec3b,
  vec3f,
  vec3h,
  vec3i,
  vec3u,
  vec4b,
  vec4f,
  vec4h,
  vec4i,
  vec4u,
} from '../../data/vector.ts';
import {
  type AnyWgslData,
  type Atomic,
  type BaseData,
  isWgslArray,
  isWgslStruct,
  type U32,
  type Void,
  type WgslArray,
} from '../../data/wgslTypes.ts';
import { getName } from '../../shared/meta.ts';
import type { LogGeneratorOptions, SerializedLogCallData } from './types.ts';

// --------------
// Serializer map
// --------------

type SerializerMap = {
  [K in AnyWgslData['type']]?: TgpuFn<(args_0: Extract<AnyWgslData, { type: K }>) => Void>;
};

const dataBlockIndex = privateVar(u32, 0).$name('dataBlockIndex');
const dataByteIndex = privateVar(u32, 0).$name('dataByteIndex');
const dataBufferSlot = slot().$name('dataBuffer');
const nextByteIndex = fn([], u32)`() {
  let i = dataByteIndex;
  dataByteIndex = dataByteIndex + 1u;
  return i;
}`
  .$uses({ dataByteIndex })
  .$name('nextByteIndex');

const nextU32 = 'dataBuffer[dataBlockIndex].serializedData[nextByteIndex()]';

export const serializerMap: SerializerMap = {
  f32: fn([f32])`(n) => {
  ${nextU32} = bitcast<u32>(n);
}`,
  f16: fn([f16])`(n) => {
  ${nextU32} = pack2x16float(vec2f(f32(n), 0.0));
}`,
  i32: fn([i32])`(n) => {
  ${nextU32} = bitcast<u32>(n);
}`,
  u32: fn([u32])`(n) => {
  ${nextU32} = n;
}`,
  bool: fn([bool])`(b) => {
  ${nextU32} = u32(b);
}`,
  vec2f: fn([vec2f])`(v) => {
  ${nextU32} = bitcast<u32>(v.x);
  ${nextU32} = bitcast<u32>(v.y);
}`,
  vec3f: fn([vec3f])`(v) => {
  ${nextU32} = bitcast<u32>(v.x);
  ${nextU32} = bitcast<u32>(v.y);
  ${nextU32} = bitcast<u32>(v.z);
}`,
  vec4f: fn([vec4f])`(v) => {
  ${nextU32} = bitcast<u32>(v.x);
  ${nextU32} = bitcast<u32>(v.y);
  ${nextU32} = bitcast<u32>(v.z);
  ${nextU32} = bitcast<u32>(v.w);
}`,
  vec2h: fn([vec2h])`(v) => {
  ${nextU32} = pack2x16float(vec2f(f32(v.x), f32(v.y)));
}`,
  vec3h: fn([vec3h])`(v) => {
  ${nextU32} = pack2x16float(vec2f(f32(v.x), f32(v.y)));
  ${nextU32} = pack2x16float(vec2f(f32(v.z), 0.0));
}`,
  vec4h: fn([vec4h])`(v) => {
  ${nextU32} = pack2x16float(vec2f(f32(v.x), f32(v.y)));
  ${nextU32} = pack2x16float(vec2f(f32(v.z), f32(v.w)));
}`,
  vec2i: fn([vec2i])`(v) => {
  ${nextU32} = bitcast<u32>(v.x);
  ${nextU32} = bitcast<u32>(v.y);
}`,
  vec3i: fn([vec3i])`(v) => {
  ${nextU32} = bitcast<u32>(v.x);
  ${nextU32} = bitcast<u32>(v.y);
  ${nextU32} = bitcast<u32>(v.z);
}`,
  vec4i: fn([vec4i])`(v) => {
  ${nextU32} = bitcast<u32>(v.x);
  ${nextU32} = bitcast<u32>(v.y);
  ${nextU32} = bitcast<u32>(v.z);
  ${nextU32} = bitcast<u32>(v.w);
}`,
  vec2u: fn([vec2u])`(v) => {
  ${nextU32} = v.x;
  ${nextU32} = v.y;
}`,
  vec3u: fn([vec3u])`(v) => {
  ${nextU32} = v.x;
  ${nextU32} = v.y;
  ${nextU32} = v.z;
}`,
  vec4u: fn([vec4u])`(v) => {
  ${nextU32} = v.x;
  ${nextU32} = v.y;
  ${nextU32} = v.z;
  ${nextU32} = v.w;
}`,
  'vec2<bool>': fn([vec2b])`(v) => {
  ${nextU32} = u32(v.x);
  ${nextU32} = u32(v.y);
}`,
  'vec3<bool>': fn([vec3b])`(v) => {
  ${nextU32} = u32(v.x);
  ${nextU32} = u32(v.y);
  ${nextU32} = u32(v.z);
}`,
  'vec4<bool>': fn([vec4b])`(v) => {
  ${nextU32} = u32(v.x);
  ${nextU32} = u32(v.y);
  ${nextU32} = u32(v.z);
  ${nextU32} = u32(v.w);
}`,
  mat2x2f: fn([mat2x2f])`(m) => {
  ${nextU32} = bitcast<u32>(m[0][0]);
  ${nextU32} = bitcast<u32>(m[0][1]);
  ${nextU32} = bitcast<u32>(m[1][0]);
  ${nextU32} = bitcast<u32>(m[1][1]);
}`,
  mat3x3f: fn([mat3x3f])`(m) => {
  ${nextU32} = bitcast<u32>(m[0][0]);
  ${nextU32} = bitcast<u32>(m[0][1]);
  ${nextU32} = bitcast<u32>(m[0][2]);
  ${nextU32} = 0u;
  ${nextU32} = bitcast<u32>(m[1][0]);
  ${nextU32} = bitcast<u32>(m[1][1]);
  ${nextU32} = bitcast<u32>(m[1][2]);
  ${nextU32} = 0u;
  ${nextU32} = bitcast<u32>(m[2][0]);
  ${nextU32} = bitcast<u32>(m[2][1]);
  ${nextU32} = bitcast<u32>(m[2][2]);
  ${nextU32} = 0u;
}`,
  mat4x4f: fn([mat4x4f])`(m) => {
  ${nextU32} = bitcast<u32>(m[0][0]);
  ${nextU32} = bitcast<u32>(m[0][1]);
  ${nextU32} = bitcast<u32>(m[0][2]);
  ${nextU32} = bitcast<u32>(m[0][3]);
  ${nextU32} = bitcast<u32>(m[1][0]);
  ${nextU32} = bitcast<u32>(m[1][1]);
  ${nextU32} = bitcast<u32>(m[1][2]);
  ${nextU32} = bitcast<u32>(m[1][3]);
  ${nextU32} = bitcast<u32>(m[2][0]);
  ${nextU32} = bitcast<u32>(m[2][1]);
  ${nextU32} = bitcast<u32>(m[2][2]);
  ${nextU32} = bitcast<u32>(m[2][3]);
  ${nextU32} = bitcast<u32>(m[3][0]);
  ${nextU32} = bitcast<u32>(m[3][1]);
  ${nextU32} = bitcast<u32>(m[3][2]);
  ${nextU32} = bitcast<u32>(m[3][3]);
}`,
};

// rename the functions and add externals
for (const [name, serializer] of Object.entries(serializerMap)) {
  serializer
    .$name(`serialize${(name[0] as string).toLocaleUpperCase()}${name.slice(1)}`)
    .$uses({ dataBlockIndex, nextByteIndex, dataBuffer: dataBufferSlot });
}

// -------
// Helpers
// -------

function generateHeader(argTypes: BaseData[]): string {
  return `(${argTypes.map((_, i) => `_arg_${i}`).join(', ')})`;
}

/**
 * Returns a serializer TGPU function for a given WGSL data type.
 * If the data type is a base type, one of the preexisting functions (with the `dataBufferSlot` filled) is returned.
 * Otherwise, a new function is generated.
 *
 * @param dataType - The WGSL data type descriptor to return a serializer for
 * @param dataBuffer - A buffer to store serialized log call data (a necessary external for the returned function)
 */
function getSerializer<T extends BaseData>(
  dataType: T,
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>,
): TgpuFn<(args_0: T) => Void> {
  const maybeSerializer = serializerMap[dataType.type as AnyWgslData['type']];
  if (maybeSerializer) {
    return (maybeSerializer as TgpuFn<(args_0: T) => Void>).with(dataBufferSlot, dataBuffer);
  }
  if (isWgslStruct(dataType)) {
    const props = Object.keys(dataType.propTypes);
    const propTypes = Object.values(dataType.propTypes);
    const propsSerializer = createCompoundSerializer(propTypes, dataBuffer);
    return fn([dataType])`(arg) {\n  propsSerializer(${props
      .map((prop) => `arg.${prop}`)
      .join(', ')});\n}`
      .$uses({ propsSerializer })
      .$name(`${getName(dataType) ?? 'struct'}Serializer`);
  }
  if (isWgslArray(dataType)) {
    const elementType = dataType.elementType as AnyWgslData;
    const length = dataType.elementCount;
    const elementSerializer = getSerializer(elementType, dataBuffer);
    return fn([dataType])`(arg) {\n${Array.from(
      { length },
      (_, i) => `  elementSerializer(arg[${i}]);`,
    ).join('\n')}\n}`
      .$uses({ elementSerializer })
      .$name('arraySerializer');
  }
  throw new Error(`Cannot serialize data of type ${dataType.type}`);
}

/**
 * Creates a compound serializer TGPU function that serializes multiple arguments of different types to the data buffer.
 *
 * @param dataTypes - Array of WGSL data types that define the types of arguments to be serialized
 * @param dataBuffer - A buffer to store serialized log call data (a necessary external for the returned function)
 */
function createCompoundSerializer(
  dataTypes: BaseData[],
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>,
) {
  const usedSerializers: Record<string, unknown> = {};

  const shell = fn(dataTypes as AnyData[]);
  const header = generateHeader(dataTypes);
  const body = dataTypes
    .map((arg, i) => {
      usedSerializers[`serializer${i}`] = getSerializer(arg, dataBuffer);
      return `  serializer${i}(_arg_${i});`;
    })
    .join('\n');

  return shell`${header} {\n${body}\n}`.$uses(usedSerializers).$name('compoundSerializer');
}

/**
 * Creates a TGPU function that serializes data to the log buffer.
 *
 * @param id - Identifier for this logging function instance
 * @param dataTypes - Array of WGSL data types that will be logged by this function
 * @param dataBuffer - Mutable buffer array to store serialized log call data
 * @param indexBuffer - Atomic counter buffer to track the next available log data slot
 * @param logOptions - Configuration options
 */
export function createLoggingFunction(
  id: number,
  dataTypes: AnyWgslData[],
  dataBuffer: TgpuMutable<WgslArray<SerializedLogCallData>>,
  indexBuffer: TgpuMutable<Atomic<U32>>,
  logOptions: Required<LogGeneratorOptions>,
): TgpuFn {
  const serializedSize = dataTypes.map(sizeOf).reduce((a, b) => a + b, 0);
  if (serializedSize > logOptions.logSizeLimit) {
    throw new Error(
      `Logged data needs to fit in ${logOptions.logSizeLimit} bytes (one of the logs requires ${serializedSize} bytes). Consider increasing the limit by passing appropriate options to tgpu.init().`,
    );
  }

  const compoundSerializer = createCompoundSerializer(dataTypes, dataBuffer).$name(
    `log${id}serializer`,
  );
  const header = generateHeader(dataTypes);

  return fn(dataTypes)`${header} {
  dataBlockIndex = atomicAdd(&indexBuffer, 1);
  if (dataBlockIndex >= ${logOptions.logCountLimit}) {
    return;
  }
  dataBuffer[dataBlockIndex].id = ${id};
  dataByteIndex = 0;

  compoundSerializer${header};
}`
    .$uses({
      indexBuffer,
      dataBuffer,
      dataBlockIndex,
      dataByteIndex,
      compoundSerializer,
    })
    .$name(`log${id}`);
}
