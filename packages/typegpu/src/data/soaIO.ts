import { invariant } from '../errors.ts';
import { roundUp } from '../mathUtils.ts';
import { alignmentOf } from './alignmentOf.ts';
import { offsetsForProps } from './offsets.ts';
import { sizeOf } from './sizeOf.ts';
import type { WgslArray, WgslStruct } from './wgslTypes.ts';
import { isMat, isMat3x3f } from './wgslTypes.ts';

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
): void {
  const structSchema = arraySchema.elementType as WgslStruct;
  const offsets = offsetsForProps(structSchema);
  const elementStride = roundUp(sizeOf(structSchema), alignmentOf(structSchema));
  const elementCount = arraySchema.elementCount;

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

    if (isMat(fieldSchema)) {
      // Matrices may have internal column padding (mat3x3f: columns are vec3f
      // stored at 16-byte stride, but packed data has 12 bytes per column).
      const dim = isMat3x3f(fieldSchema) ? 3 : fieldSchema.type === 'mat2x2f' ? 2 : 4;
      const compSize = 4; // all current matrix types use f32
      const packedColumnSize = dim * compSize;
      const gpuColumnStride = roundUp(packedColumnSize, alignmentOf(fieldSchema));
      const packedElementSize = dim * packedColumnSize; // total packed bytes per matrix

      for (let i = 0; i < elementCount; i++) {
        const dstBase = startOffset + i * elementStride + fieldOffset;
        const srcBase = i * packedElementSize;
        for (let col = 0; col < dim; col++) {
          target.set(
            srcBytes.subarray(
              srcBase + col * packedColumnSize,
              srcBase + col * packedColumnSize + packedColumnSize,
            ),
            dstBase + col * gpuColumnStride,
          );
        }
      }
    } else {
      // Scalars and vectors: packed size equals sizeOf(field), no internal padding.
      const fieldSize = sizeOf(fieldSchema);
      for (let i = 0; i < elementCount; i++) {
        target.set(
          srcBytes.subarray(i * fieldSize, i * fieldSize + fieldSize),
          startOffset + i * elementStride + fieldOffset,
        );
      }
    }
  }
}
