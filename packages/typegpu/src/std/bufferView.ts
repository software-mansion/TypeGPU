import { dualImpl, MissingCpuImplError } from '../core/function/dualImpl.ts';
import { warnIfNotUniformAligned } from '../core/pipeline/webgpuLimitations.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { alignmentOf } from '../data/alignmentOf.ts';
import { type buffer, isWgslBuffer, type WgslBuffer } from '../data/buffer.ts';
import { undecorate, unptr } from '../data/dataTypes.ts';
import { u32 } from '../data/numeric.ts';
import { offsetsForProps } from '../data/offsets.ts';
import { createPtrFromOrigin } from '../data/ptr.ts';
import { type _ref as ref, derefSnippet } from '../data/ref.ts';
import { sizeOf } from '../data/sizeOf.ts';
import { snip, type Snippet } from '../data/snippet.ts';
import {
  type Atomic,
  type BaseData,
  type Decorated,
  isMat,
  isVec,
  isVecBool,
  isWgslArray,
  isWgslData,
  isWgslStruct,
  type StorableData,
  type WgslArray,
  type WgslStruct,
} from '../data/wgslTypes.ts';
import { roundUp } from '../mathUtils.ts';
import { setName } from '../shared/meta.ts';
import type { ExtractInvalidSchemaError, InferGPU, IsValidStorageSchema } from '../shared/repr.ts';
import { $gpuCallable } from '../shared/symbols.ts';
import { tryConvertSnippet } from '../tgsl/conversion.ts';
import { asComptime, type DualFn, type ResolutionCtx } from '../types.ts';

// ----------
// Public API
// ----------

type ViewSchema = BaseData | ((count: number) => BaseData);

type UnwrapViewSchema<T> = T extends BaseData
  ? T
  : T extends (count: number) => infer TSchema
    ? TSchema extends BaseData
      ? TSchema
      : never
    : never;

type ContainsAtomic<T> = T extends Atomic
  ? true
  : T extends Decorated<infer TInner>
    ? ContainsAtomic<TInner>
    : T extends WgslArray<infer TElement>
      ? ContainsAtomic<TElement>
      : T extends WgslStruct<infer TProps>
        ? true extends { [K in keyof TProps]: ContainsAtomic<TProps[K]> }[keyof TProps]
          ? true
          : false
        : false;

type ViewSchemaError<T> = T extends WgslBuffer
  ? '(Error) Buffers cannot be viewed as buffers'
  : IsValidStorageSchema<T> extends false
    ? ExtractInvalidSchemaError<T, '(Error) '>
    : ContainsAtomic<T> extends true
      ? '(Error) Buffer views cannot hold atomics'
      : never;

type ValidateViewSchema<T> = [ViewSchemaError<UnwrapViewSchema<T>>] extends [never]
  ? T
  : ViewSchemaError<UnwrapViewSchema<T>>;

type BufferViewFn = <TSchema extends ViewSchema>(
  schema: ValidateViewSchema<TSchema>,
  buffer: buffer,
  byteOffset: number,
) => ref<InferGPU<UnwrapViewSchema<TSchema>>>;

type BufferArrayViewFn = <TSchema extends (count: number) => BaseData>(
  schema: ValidateViewSchema<TSchema>,
  buffer: buffer,
  byteOffset: number,
  byteSize: number,
) => ref<InferGPU<UnwrapViewSchema<TSchema>>>;

/**
 * Reads the bytes of a `d.buffer` at `byteOffset` as `schema`, mirroring WGSL's `bufferView<T>`.
 * Returns a reference: access its members and elements directly, and read or write the whole value with `.$`.
 * The reference is mutable if the buffer is.
 *
 * A runtime-sized schema, such as `d.arrayOf(d.f32)`, extends to the end of the buffer.
 * The offset must be a multiple of the schema's alignment.
 *
 * @example
 * const header = std.bufferView(Header, packet.$, 0);
 * header.count += 1;
 * std.bufferView(d.u32, packet.$, 64).$ = 7;
 */
export const bufferView = createBufferViewFn('bufferView') as unknown as DualFn<BufferViewFn>;

/**
 * Reads `byteSize` bytes of a `d.buffer` at `byteOffset` as a runtime-sized `schema`,
 * mirroring WGSL's `bufferArrayView<T>`. Use it to bound arrays that don't extend to the end
 * of the buffer: their `length` covers only `byteSize` bytes.
 *
 * @example
 * const indices = std.bufferArrayView(d.arrayOf(d.u32), packet.$, 16, indexCount * 4);
 */
export const bufferArrayView = createBufferViewFn(
  'bufferArrayView',
) as unknown as DualFn<BufferArrayViewFn>;

/**
 * Returns the size of a `d.buffer` in bytes, mirroring WGSL's `bufferLength`.
 */
export const bufferLength = dualImpl<(buffer: buffer) => number>({
  name: 'bufferLength',
  normalImpl: 'bufferLength is not supported outside of CODEGEN mode.',
  signature: (buffer) => {
    assertBuffer('bufferLength', buffer);
    return { argTypes: [buffer], returnType: u32 };
  },
  codegenImpl: (_ctx, [buffer]) => stitch`bufferLength(&${derefSnippet(buffer)})`,
  sideEffects: false,
});

// --------------
// Implementation
// --------------

function createBufferViewFn(name: 'bufferView' | 'bufferArrayView') {
  const impl = () => {
    throw new MissingCpuImplError(`${name} is not supported outside of CODEGEN mode.`);
  };
  setName(impl, name);
  impl.toString = () => name;

  return Object.assign(impl, {
    [$gpuCallable]: {
      call(ctx: ResolutionCtx, [schemaArg, bufferArg, offsetArg, sizeArg]: Snippet[]) {
        if (!schemaArg || !bufferArg || !offsetArg || (name === 'bufferArrayView' && !sizeArg)) {
          throw new Error(`Missing arguments to std.${name}.`);
        }

        const schema = unwrapViewSchema(name, schemaArg);
        const typeName = ctx.resolve(schema).value;
        assertViewable(name, typeName, schema);
        const buffer = derefSnippet(bufferArg);
        assertBuffer(name, buffer.dataType);
        const ptrType = createPtrFromOrigin(buffer.origin, schema as StorableData);
        if (!ptrType) {
          throw new Error(
            `std.${name} needs a buffer in the storage, uniform or workgroup address space.`,
          );
        }

        if (ptrType.addressSpace === 'uniform') {
          warnIfNotUniformAligned(schema);
        }

        const offset = tryConvertSnippet(ctx, offsetArg, u32);
        const size = sizeArg && tryConvertSnippet(ctx, sizeArg, u32);
        assertViewFits(name, typeName, schema, buffer.dataType, offset, size);

        return snip(
          stitch`${name}<${typeName}>(&${buffer}, ${[offset, size]})`,
          ptrType,
          buffer.origin,
          buffer.possibleSideEffects || offset.possibleSideEffects || !!size?.possibleSideEffects,
        );
      },
    },
  });
}

function unwrapViewSchema(name: string, arg: Snippet): BaseData {
  const value = asComptime(arg)?.value;
  const schema = !isWgslData(value) && typeof value === 'function' ? value(0) : value;
  if (!isWgslData(schema)) {
    throw new Error(`std.${name} expects a schema as its first argument.`);
  }

  const runtimeSized = Number.isNaN(sizeOf(schema));
  if (name === 'bufferArrayView' && !runtimeSized) {
    throw new Error(
      `std.bufferArrayView needs a runtime-sized schema, such as d.arrayOf(d.u32). Use std.bufferView for '${schema}'.`,
    );
  }
  return schema;
}

function assertViewable(name: string, typeName: string, schema: BaseData): void {
  const inner = undecorate(schema);
  if (isWgslStruct(inner)) {
    for (const prop of Object.values(inner.propTypes)) {
      assertViewable(name, typeName, prop);
    }
    return;
  }
  if (isWgslArray(inner)) {
    assertViewable(name, typeName, inner.elementType);
    return;
  }
  if (inner.type === 'atomic') {
    throw new Error(
      `std.${name} cannot view '${typeName}', because WGSL buffer views cannot hold atomics.`,
    );
  }
  const hostShareable =
    ['f32', 'f16', 'i32', 'u32'].includes(inner.type) ||
    (isVec(inner) && !isVecBool(inner)) ||
    isMat(inner);
  if (!hostShareable) {
    throw new Error(
      `std.${name} cannot view '${typeName}', because '${inner.type}' is not host-shareable.`,
    );
  }
}

function assertBuffer(name: string, dataType: unknown): asserts dataType is WgslBuffer {
  const inner = unptr(dataType as BaseData);
  if (!isWgslBuffer(inner)) {
    throw new Error(
      `std.${name} expects a d.buffer, got '${String(inner)}'. Declare the buffer with d.buffer(n).`,
    );
  }
}

/**
 * The fewest bytes a view of `schema` covers: a runtime-sized array needs one element.
 */
function minSizeOf(schema: BaseData): number {
  const size = sizeOf(schema);
  if (!Number.isNaN(size)) {
    return size;
  }
  if (isWgslArray(schema)) {
    return roundUp(sizeOf(schema.elementType), alignmentOf(schema.elementType));
  }
  if (isWgslStruct(schema)) {
    const [key, lastProp] = Object.entries(schema.propTypes).pop() as [string, BaseData];
    return (offsetsForProps(schema)[key]?.offset ?? 0) + minSizeOf(lastProp);
  }
  return size;
}

function assertViewFits(
  name: string,
  typeName: string,
  schema: BaseData,
  buffer: WgslBuffer,
  offsetArg: Snippet,
  sizeArg: Snippet | undefined,
): void {
  const offset = asComptime(offsetArg)?.value;
  if (typeof offset !== 'number') {
    return;
  }

  const alignment = alignmentOf(schema);
  if (offset % alignment !== 0) {
    throw new Error(
      `std.${name} cannot view '${typeName}' at byte ${offset}, because the offset is not a multiple of its alignment (${alignment}).`,
    );
  }

  const size = sizeArg && asComptime(sizeArg)?.value;
  const viewSize = typeof size === 'number' ? Math.max(size, minSizeOf(schema)) : minSizeOf(schema);
  if (buffer.byteSize > 0 && offset + viewSize > buffer.byteSize) {
    throw new Error(
      `std.${name} cannot view '${typeName}' at byte ${offset} of d.${buffer}, because the view needs ${viewSize} bytes and only ${Math.max(buffer.byteSize - offset, 0)} are left.`,
    );
  }
}
