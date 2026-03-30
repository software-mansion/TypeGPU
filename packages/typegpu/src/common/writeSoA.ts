import { invariant } from '../errors.ts';
import { roundUp } from '../mathUtils.ts';
import type { Undecorate } from '../data/dataTypes.ts';
import { alignmentOf } from '../data/alignmentOf.ts';
import { undecorate } from '../data/dataTypes.ts';
import { offsetsForProps } from '../data/offsets.ts';
import { sizeOf } from '../data/sizeOf.ts';
import type { BaseData, TypedArrayFor, WgslArray, WgslStruct } from '../data/wgslTypes.ts';
import { isAtomic, isMat, isMat2x2f, isMat3x3f, isWgslArray } from '../data/wgslTypes.ts';
import type { BufferWriteOptions, TgpuBuffer } from '../core/buffer/buffer.ts';
import type { Prettify } from '../shared/utilityTypes.ts';

type PackedScalarFor<T> =
  Undecorate<T> extends WgslArray<infer TElement> ? PackedScalarFor<TElement> : Undecorate<T>;

type PackedSoAInputFor<T> = TypedArrayFor<PackedScalarFor<T>>;

type SoAFieldsFor<T extends Record<string, BaseData>> = {
  [K in keyof T as [PackedSoAInputFor<T[K]>] extends [never] ? never : K]: PackedSoAInputFor<T[K]>;
};

type SoAInputFor<T extends Record<string, BaseData>> = [keyof T] extends [keyof SoAFieldsFor<T>]
  ? Prettify<SoAFieldsFor<T>>
  : never;

function packedSchemaOf(schema: BaseData): BaseData {
  const unpackedSchema = undecorate(schema);
  return isAtomic(unpackedSchema) ? unpackedSchema.inner : unpackedSchema;
}

function packedMatrixDimOf(schema: BaseData): 2 | 3 | 4 | undefined {
  return isMat3x3f(schema) ? 3 : isMat2x2f(schema) ? 2 : isMat(schema) ? 4 : undefined;
}

function packedSizeOf(schema: BaseData): number {
  const packedSchema = packedSchemaOf(schema);
  const matrixDim = packedMatrixDimOf(packedSchema);
  if (matrixDim) {
    return matrixDim * matrixDim * 4;
  }
  if (isWgslArray(packedSchema)) {
    return packedSchema.elementCount * packedSizeOf(packedSchema.elementType);
  }
  return sizeOf(packedSchema);
}

function computeSoAByteLength(
  arraySchema: WgslArray,
  soaData: Record<string, ArrayBufferView>,
): number | undefined {
  const structSchema = arraySchema.elementType as WgslStruct;
  let inferredCount: number | undefined;

  for (const key in structSchema.propTypes) {
    const srcArray = soaData[key];
    const fieldSchema = structSchema.propTypes[key];
    if (srcArray === undefined || fieldSchema === undefined) {
      continue;
    }
    const packedFieldSize = packedSizeOf(fieldSchema);
    if (packedFieldSize === 0) {
      continue;
    }
    const fieldElementCount = Math.floor(srcArray.byteLength / packedFieldSize);
    inferredCount =
      inferredCount === undefined ? fieldElementCount : Math.min(inferredCount, fieldElementCount);
  }
  if (inferredCount === undefined) {
    return undefined;
  }
  const elementStride = roundUp(sizeOf(structSchema), alignmentOf(structSchema));
  return inferredCount * elementStride;
}

function writePackedValue(
  target: Uint8Array,
  schema: BaseData,
  srcBytes: Uint8Array,
  dstOffset: number,
  srcOffset: number,
): void {
  const unpackedSchema = undecorate(schema);
  const packedSchema = isAtomic(unpackedSchema) ? unpackedSchema.inner : unpackedSchema;
  const matrixDim = packedMatrixDimOf(packedSchema);
  if (matrixDim) {
    const packedColumnSize = matrixDim * 4;
    const gpuColumnStride = roundUp(packedColumnSize, alignmentOf(schema));
    for (let col = 0; col < matrixDim; col++) {
      target.set(
        srcBytes.subarray(
          srcOffset + col * packedColumnSize,
          srcOffset + col * packedColumnSize + packedColumnSize,
        ),
        dstOffset + col * gpuColumnStride,
      );
    }
    return;
  }
  if (isWgslArray(unpackedSchema)) {
    const packedElementSize = packedSizeOf(unpackedSchema.elementType);
    const gpuElementStride = roundUp(
      sizeOf(unpackedSchema.elementType),
      alignmentOf(unpackedSchema.elementType),
    );

    for (let i = 0; i < unpackedSchema.elementCount; i++) {
      writePackedValue(
        target,
        unpackedSchema.elementType,
        srcBytes,
        dstOffset + i * gpuElementStride,
        srcOffset + i * packedElementSize,
      );
    }
    return;
  }
  target.set(srcBytes.subarray(srcOffset, srcOffset + sizeOf(packedSchema)), dstOffset);
}

function scatterSoA(
  target: Uint8Array,
  arraySchema: WgslArray,
  soaData: Record<string, ArrayBufferView>,
  startOffset: number,
  endOffset: number,
): void {
  const structSchema = arraySchema.elementType as WgslStruct;
  const elementStride = roundUp(sizeOf(structSchema), alignmentOf(structSchema));
  invariant(
    startOffset % elementStride === 0,
    `startOffset (${startOffset}) must be aligned to the element stride (${elementStride})`,
  );
  const startElement = Math.floor(startOffset / elementStride);
  const endElement = Math.min(arraySchema.elementCount, Math.ceil(endOffset / elementStride));
  const elementCount = Math.max(0, endElement - startElement);
  const offsets = offsetsForProps(structSchema);

  for (const key in structSchema.propTypes) {
    const fieldSchema = structSchema.propTypes[key];
    if (fieldSchema === undefined) {
      continue;
    }
    const srcArray = soaData[key];
    invariant(srcArray !== undefined, `Missing SoA data for field '${key}'`);
    const fieldOffset = offsets[key]?.offset;
    invariant(fieldOffset !== undefined, `Field ${key} not found in struct schema`);
    const packedFieldSize = packedSizeOf(fieldSchema);
    const srcBytes = new Uint8Array(srcArray.buffer, srcArray.byteOffset, srcArray.byteLength);
    for (let i = 0; i < elementCount; i++) {
      writePackedValue(
        target,
        fieldSchema,
        srcBytes,
        (startElement + i) * elementStride + fieldOffset,
        i * packedFieldSize,
      );
    }
  }
}

export function writeSoA<TProps extends Record<string, BaseData>>(
  buffer: TgpuBuffer<WgslArray<WgslStruct<TProps>>>,
  data: SoAInputFor<TProps>,
  options?: BufferWriteOptions,
): void {
  const arrayBuffer = buffer.arrayBuffer;
  const startOffset = options?.startOffset ?? 0;
  const bufferSize = sizeOf(buffer.dataType);
  const naturalSize = computeSoAByteLength(
    buffer.dataType,
    data as Record<string, ArrayBufferView>,
  );
  const endOffset =
    options?.endOffset ??
    (naturalSize === undefined ? bufferSize : Math.min(startOffset + naturalSize, bufferSize));

  scatterSoA(
    new Uint8Array(arrayBuffer),
    buffer.dataType,
    data as Record<string, ArrayBufferView>,
    startOffset,
    endOffset,
  );
  buffer.write(arrayBuffer, { startOffset, endOffset });
}

export namespace writeSoA {
  export type InputFor<TProps extends Record<string, BaseData>> = SoAInputFor<TProps>;
}
