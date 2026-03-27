import { invariant } from '../errors.ts';
import { roundUp } from '../mathUtils.ts';
import { alignmentOf } from './alignmentOf.ts';
import { offsetsForProps } from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import type { BaseData, WgslArray, WgslStruct } from './wgslTypes.ts';
import { isMat, isMat2x2f, isMat3x3f, isWgslArray, isWgslStruct } from './wgslTypes.ts';

function getPackedMatrixLayout(schema: BaseData) {
  if (!isMat(schema)) {
    return undefined;
  }

  const dim = isMat3x3f(schema) ? 3 : isMat2x2f(schema) ? 2 : 4;
  const packedColumnSize = dim * 4;

  return {
    dim,
    packedColumnSize,
    packedSize: dim * packedColumnSize,
  } as const;
}

export function packedSizeOf(schema: BaseData): number {
  const matrixLayout = getPackedMatrixLayout(schema);
  if (matrixLayout) {
    return matrixLayout.packedSize;
  }

  if (isWgslArray(schema)) {
    return schema.elementCount * packedSizeOf(schema.elementType);
  }

  return sizeOf(schema);
}

export function inferSoAElementCount(
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

export function isSoACompatibleField(schema: BaseData): boolean {
  if (isWgslArray(schema)) {
    return isSoACompatibleField(schema.elementType);
  }

  return !isWgslStruct(schema);
}

export function getSoANaturalSize(dataType: BaseData, data: unknown): number | undefined {
  if (
    !isWgslArray(dataType) ||
    !isWgslStruct(dataType.elementType) ||
    Array.isArray(data) ||
    typeof data !== 'object' ||
    data === null
  ) {
    return undefined;
  }

  const soaData = data as Record<string, unknown>;
  const values = Object.values(soaData);
  const isSoAInput =
    values.length > 0 &&
    values.every(ArrayBuffer.isView) &&
    Object.values(dataType.elementType.propTypes).every(isSoACompatibleField);

  if (!isSoAInput) {
    return undefined;
  }

  const elementCount = inferSoAElementCount(dataType, soaData as Record<string, ArrayBufferView>);
  if (elementCount === undefined) {
    return undefined;
  }

  const elementStride = roundUp(sizeOf(dataType.elementType), alignmentOf(dataType.elementType));
  return elementCount * elementStride;
}

function writePackedValue(
  target: Uint8Array,
  schema: BaseData,
  srcBytes: Uint8Array,
  dstOffset: number,
  srcOffset: number,
): void {
  const matrixLayout = getPackedMatrixLayout(schema);
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

  if (isWgslArray(schema)) {
    const packedElementSize = packedSizeOf(schema.elementType);
    const gpuElementStride = roundUp(sizeOf(schema.elementType), alignmentOf(schema.elementType));

    for (let i = 0; i < schema.elementCount; i++) {
      writePackedValue(
        target,
        schema.elementType,
        srcBytes,
        dstOffset + i * gpuElementStride,
        srcOffset + i * packedElementSize,
      );
    }

    return;
  }

  target.set(srcBytes.subarray(srcOffset, srcOffset + sizeOf(schema)), dstOffset);
}

/**
 * Writes struct-of-arrays (SoA) data into a GPU-layout (AoS) target buffer.
 *
 * Each key in `soaData` is a struct field name mapped to a packed TypedArray
 * containing that field's values for all elements (no inter-element padding).
 * This function scatters those packed arrays into the correctly padded AoS layout.
 */
export function writeSoA(
  target: Uint8Array,
  arraySchema: WgslArray,
  soaData: Record<string, ArrayBufferView>,
  startOffset: number,
  endOffset: number,
): void {
  const structSchema = arraySchema.elementType as WgslStruct;
  const offsets = offsetsForProps(structSchema);
  const elementStride = roundUp(sizeOf(structSchema), alignmentOf(structSchema));
  const startElement = Math.floor(startOffset / elementStride);
  const endElement = Math.min(arraySchema.elementCount, Math.ceil(endOffset / elementStride));
  const elementCount = Math.max(0, endElement - startElement);

  for (const key in structSchema.propTypes) {
    const fieldSchema = structSchema.propTypes[key];
    if (fieldSchema === undefined) {
      continue;
    }
    const srcArray = soaData[key];
    if (srcArray === undefined) {
      continue;
    }

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
