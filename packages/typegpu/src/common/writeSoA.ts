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
  const unpacked = undecorate(schema);
  return isAtomic(unpacked) ? unpacked.inner : unpacked;
}

function getPackedMatrixLayout(packedSchema: BaseData) {
  if (!isMat(packedSchema)) {
    return undefined;
  }

  const dim = isMat3x3f(packedSchema) ? 3 : isMat2x2f(packedSchema) ? 2 : 4;
  const packedColumnSize = dim * 4;

  return {
    dim,
    packedColumnSize,
    packedSize: dim * packedColumnSize,
  } as const;
}

function packedSizeOf(schema: BaseData): number {
  const packedSchema = packedSchemaOf(schema);
  const matrixLayout = getPackedMatrixLayout(packedSchema);
  if (matrixLayout) {
    return matrixLayout.packedSize;
  }

  if (isWgslArray(packedSchema)) {
    return packedSchema.elementCount * packedSizeOf(packedSchema.elementType);
  }

  return sizeOf(packedSchema);
}

function inferSoAElementCount(
  arraySchema: WgslArray,
  soaData: Record<string, ArrayBufferView>,
): number | undefined {
  const structSchema = arraySchema.elementType as WgslStruct;
  let inferredCount: number | undefined;

  for (const key in soaData) {
    const srcArray = soaData[key];
    const fieldSchema = structSchema.propTypes[key];
    if (srcArray === undefined || fieldSchema === undefined) {
      continue;
    }

    const fieldPackedSize = packedSizeOf(fieldSchema);
    if (fieldPackedSize === 0) {
      continue;
    }

    const fieldElementCount = Math.floor(srcArray.byteLength / fieldPackedSize);
    inferredCount =
      inferredCount === undefined ? fieldElementCount : Math.min(inferredCount, fieldElementCount);
  }

  return inferredCount;
}

function computeSoAByteLength(
  arraySchema: WgslArray,
  soaData: Record<string, ArrayBufferView>,
): number | undefined {
  const elementCount = inferSoAElementCount(arraySchema, soaData);
  if (elementCount === undefined) {
    return undefined;
  }
  const elementStride = roundUp(
    sizeOf(arraySchema.elementType),
    alignmentOf(arraySchema.elementType),
  );
  return elementCount * elementStride;
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
  const matrixLayout = getPackedMatrixLayout(packedSchema);
  if (matrixLayout) {
    const gpuColumnStride = roundUp(matrixLayout.packedColumnSize, alignmentOf(schema));

    for (let col = 0; col < matrixLayout.dim; col++) {
      target.set(
        srcBytes.subarray(
          srcOffset + col * matrixLayout.packedColumnSize,
          srcOffset + col * matrixLayout.packedColumnSize + matrixLayout.packedColumnSize,
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
  const offsets = offsetsForProps(structSchema);
  const elementStride = roundUp(sizeOf(structSchema), alignmentOf(structSchema));
  invariant(
    startOffset % elementStride === 0,
    `startOffset (${startOffset}) must be aligned to the element stride (${elementStride})`,
  );
  const startElement = Math.floor(startOffset / elementStride);
  const endElement = Math.min(arraySchema.elementCount, Math.ceil(endOffset / elementStride));
  const elementCount = Math.max(0, endElement - startElement);

  for (const key in structSchema.propTypes) {
    const fieldSchema = structSchema.propTypes[key];
    if (fieldSchema === undefined) {
      continue;
    }
    const srcArray = soaData[key];
    invariant(srcArray !== undefined, `Missing SoA data for field '${key}'`);

    const fieldOffset = offsets[key]?.offset;
    invariant(fieldOffset !== undefined, `Field ${key} not found in struct schema`);
    const srcBytes = new Uint8Array(srcArray.buffer, srcArray.byteOffset, srcArray.byteLength);

    const packedFieldSize = packedSizeOf(fieldSchema);
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
