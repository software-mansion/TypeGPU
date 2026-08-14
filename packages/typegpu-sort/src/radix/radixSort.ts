import { d, std, type StorageFlag, type TgpuBuffer, type TgpuRoot } from 'typegpu';
import { decomposeWorkgroups } from '../dispatch.ts';
import { beginRunPass, bindPass } from '../runPass.ts';
import { createPrefixScanComputer } from '../scan/index.ts';
import type { RunOptions, Sorter } from '../types.ts';
import { makeCountKernel } from './count.ts';
import { makeScatterKernel } from './scatter.ts';
import {
  histLayout,
  makeRadixSchemas,
  NUM_PASSES,
  RADIX_BITS,
  RADIX_SIZE,
  type RadixKeyType,
  shiftLayout,
  TILE_SIZE,
} from './schemas.ts';
import type { RadixSorterOptions } from './types.ts';

type KeyBuffer = TgpuBuffer<d.WgslArray<RadixKeyType>> & StorageFlag;
type ValueBuffer = TgpuBuffer<d.WgslArray<d.AnyWgslData>> & StorageFlag;

/**
 * Creates a stable LSD radix sorter for a `u32`, `i32` or `f32` key buffer, optionally
 * reordering a payload buffer alongside the keys. Keys are ordered by the natural order
 * of their type. All GPU resources are created up front, so `run` only records dispatches.
 *
 * For `f32` keys sorted ascending, NaNs with a cleared sign bit sort after +Infinity and
 * NaNs with a set sign bit sort before -Infinity. -0 and +0 compare equal.
 */
export function createRadixSorter<
  TKey extends RadixKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
>(
  root: TgpuRoot,
  keys: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag,
  options?: RadixSorterOptions<TValue>,
): Sorter {
  const keyBuffer = keys as KeyBuffer;
  const valueBuffer = options?.values as ValueBuffer | undefined;
  const keyType = keyBuffer.dataType.elementType;
  const size = keyBuffer.dataType.elementCount;

  if (size === 0) {
    throw new Error('Cannot create a radix sorter for an empty buffer.');
  }
  if (valueBuffer && valueBuffer.dataType.elementCount !== size) {
    throw new Error(
      `The values buffer (${valueBuffer.dataType.elementCount} elements) must match the key buffer (${size} elements).`,
    );
  }

  const schemas = makeRadixSchemas(
    keyType,
    options?.direction ?? 'ascending',
    valueBuffer?.dataType.elementType,
  );

  const numTiles = Math.ceil(size / TILE_SIZE);
  const dispatch = decomposeWorkgroups(numTiles);

  const histBuffer = root.createBuffer(d.arrayOf(d.u32, numTiles * RADIX_SIZE)).$usage('storage');
  const tempBuffer = root.createBuffer(d.arrayOf(keyType, size)).$usage('storage') as KeyBuffer;
  const owned: { destroy(): void }[] = [histBuffer, tempBuffer];

  const scanPlan = createPrefixScanComputer(root, {
    operation: std.add,
    identityElement: 0,
    dataType: d.u32,
  }).prepare(histBuffer);

  const tempValues =
    valueBuffer &&
    (root
      .createBuffer(d.arrayOf(valueBuffer.dataType.elementType, size))
      .$usage('storage') as ValueBuffer);
  if (tempValues) {
    owned.push(tempValues);
  }

  const histBg = root.createBindGroup(histLayout, { hist: histBuffer });
  const ioBgKeysToTemp = root.createBindGroup(schemas.ioLayout, {
    src: keyBuffer,
    dst: tempBuffer,
  });
  const ioBgTempToKeys = root.createBindGroup(schemas.ioLayout, {
    src: tempBuffer,
    dst: keyBuffer,
  });

  const valuesBgs =
    valueBuffer && tempValues
      ? {
          keysToTemp: root.createBindGroup(schemas.valuesLayout, {
            srcVals: valueBuffer,
            dstVals: tempValues,
          }),
          tempToKeys: root.createBindGroup(schemas.valuesLayout, {
            srcVals: tempValues,
            dstVals: valueBuffer,
          }),
        }
      : undefined;

  const countPipeline = root
    .createComputePipeline({ compute: makeCountKernel(schemas, size, numTiles) })
    .with(histBg);
  const scatterPipeline = root
    .createComputePipeline({ compute: makeScatterKernel(schemas, size, numTiles) })
    .with(histBg);

  const passes = Array.from({ length: NUM_PASSES }, (_, pass) => {
    const shift = root.createBuffer(d.u32, pass * RADIX_BITS).$usage('uniform');
    owned.push(shift);

    const shiftBg = root.createBindGroup(shiftLayout, { shift });
    const forward = pass % 2 === 0;
    const ioBg = forward ? ioBgKeysToTemp : ioBgTempToKeys;
    const valuesBg = forward ? valuesBgs?.keysToTemp : valuesBgs?.tempToKeys;

    const scatter = scatterPipeline.with(ioBg).with(shiftBg);
    return {
      count: countPipeline.with(ioBg).with(shiftBg),
      scatter: valuesBg ? scatter.with(valuesBg) : scatter,
    };
  });

  return {
    size,

    initSync(): void {
      countPipeline.initSync();
      scatterPipeline.initSync();
      scanPlan.initSync();
    },

    async initAsync(): Promise<void> {
      await Promise.all([
        countPipeline.initAsync(),
        scatterPipeline.initAsync(),
        scanPlan.initAsync(),
      ]);
    },

    run(runOptions?: RunOptions): void {
      const recording = beginRunPass(root.device, runOptions);
      for (const { count, scatter } of passes) {
        bindPass(count, recording.pass).dispatchWorkgroups(...dispatch);
        scanPlan.run({ pass: recording.pass });
        bindPass(scatter, recording.pass).dispatchWorkgroups(...dispatch);
      }
      recording.finish();
    },

    destroy(): void {
      scanPlan.destroy();
      for (const buffer of owned) {
        buffer.destroy();
      }
    },
  };
}
