import { d, std, type StorageFlag, type TgpuBuffer, type TgpuRoot } from 'typegpu';
import { decomposeWorkgroups } from '../bitonic/utils.ts';
import { beginRunPass } from '../runPass.ts';
import { createPrefixScanComputer } from '../scan/index.ts';
import { makeCountKernel } from './count.ts';
import { makeScatterKernel } from './scatter.ts';
import {
  histLayout,
  makeRadixSchemas,
  NUM_PASSES,
  paramsLayout,
  paramsType,
  RADIX_BITS,
  RADIX_SIZE,
  type RadixKeyType,
  TILE_SIZE,
} from './schemas.ts';
import type { RadixSorter, RadixSorterOptions, RadixSorterRunOptions } from './types.ts';

type KeyBuffer = TgpuBuffer<d.WgslArray<RadixKeyType>> & StorageFlag;
type ValueBuffer = TgpuBuffer<d.WgslArray<d.AnyWgslData>> & StorageFlag;

/**
 * Create a radix sorter for the given key buffer (u32, i32 or f32 elements). The
 * sorter is a 4-pass LSD radix sort (8 bits per pass): each pass counts digit
 * occurrences per tile (TILE_SIZE elements, several keys per thread) into a
 * digit-major histogram, turns the histogram into scatter offsets with a single
 * exclusive prefix scan, and scatters elements to their stable positions. i32 and f32 keys are ordered via
 * order-preserving bit transforms applied at digit extraction only — the data
 * buffers are never transformed. For f32 keys sorted ascending, NaNs with a
 * cleared sign bit sort after +Infinity and NaNs with a set sign bit sort
 * before -Infinity; the sort is oblivious to the distinction between -0 and +0.
 *
 * All internal buffers, bind groups and pipelines are created up front; `run`
 * only records dispatches.
 */
export function createRadixSorter<
  TKey extends RadixKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
>(
  root: TgpuRoot,
  keys: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag,
  options?: RadixSorterOptions<TValue>,
): RadixSorter {
  const keyBuffer = keys as KeyBuffer;
  const valueBuffer = options?.values as ValueBuffer | undefined;

  const n = keyBuffer.dataType.elementCount;
  if (n === 0) {
    throw new Error('Cannot create a radix sorter for an empty buffer.');
  }

  if (valueBuffer && valueBuffer.dataType.elementCount !== n) {
    throw new Error(
      `The values buffer (${valueBuffer.dataType.elementCount} elements) must match the key buffer (${n} elements).`,
    );
  }

  const schemas = makeRadixSchemas(
    keyBuffer.dataType.elementType,
    options?.direction ?? 'ascending',
    valueBuffer?.dataType.elementType,
  );

  const numTiles = Math.ceil(n / TILE_SIZE);

  const histBuffer = root.createBuffer(d.arrayOf(d.u32, numTiles * RADIX_SIZE)).$usage('storage');
  const tempBuffer = root
    .createBuffer(d.arrayOf(keyBuffer.dataType.elementType, n))
    .$usage('storage') as KeyBuffer;
  const tempValuesBuffer = valueBuffer
    ? (root
        .createBuffer(d.arrayOf(valueBuffer.dataType.elementType, n))
        .$usage('storage') as ValueBuffer)
    : undefined;
  const paramBuffers = Array.from({ length: NUM_PASSES }, (_, pass) =>
    root.createBuffer(paramsType, { shift: pass * RADIX_BITS, numTiles }).$usage('uniform'),
  );

  const scanComputer = createPrefixScanComputer(root, {
    operation: std.add,
    identityElement: 0,
    dataType: d.u32,
  });
  const scanPlan = scanComputer.prepare(histBuffer);

  const scatterPipeline = root.createComputePipeline({ compute: makeScatterKernel(schemas, n) });

  const countPipeline = root.createComputePipeline({ compute: makeCountKernel(schemas, n) });

  const histBg = root.createBindGroup(histLayout, { hist: histBuffer });
  const paramBgs = paramBuffers.map((buffer) =>
    root.createBindGroup(paramsLayout, { params: buffer }),
  );
  const ioBgAtoB = root.createBindGroup(schemas.ioLayout, { src: keyBuffer, dst: tempBuffer });
  const ioBgBtoA = root.createBindGroup(schemas.ioLayout, { src: tempBuffer, dst: keyBuffer });

  const valuesBgs =
    schemas.valuesLayout && valueBuffer && tempValuesBuffer
      ? [
          root.createBindGroup(schemas.valuesLayout, {
            srcVals: valueBuffer,
            dstVals: tempValuesBuffer,
          }),
          root.createBindGroup(schemas.valuesLayout, {
            srcVals: tempValuesBuffer,
            dstVals: valueBuffer,
          }),
        ]
      : undefined;

  const [wgX, wgY, wgZ] = decomposeWorkgroups(numTiles);

  function run(runOptions?: RadixSorterRunOptions): void {
    const recording = beginRunPass(root.device, runOptions);
    const computePass = recording.pass;

    for (let pass = 0; pass < NUM_PASSES; pass++) {
      const paramsBg = paramBgs[pass] as (typeof paramBgs)[number];
      const ioBg = pass % 2 === 0 ? ioBgAtoB : ioBgBtoA;

      let scatterPipe = scatterPipeline.with(histBg).with(ioBg).with(paramsBg);
      if (valuesBgs) {
        scatterPipe = scatterPipe.with(valuesBgs[pass % 2] as (typeof valuesBgs)[number]);
      }

      countPipeline
        .with(histBg)
        .with(ioBg)
        .with(paramsBg)
        .with(computePass)
        .dispatchWorkgroups(wgX, wgY, wgZ);
      scanPlan.run({ pass: computePass });
      scatterPipe.with(computePass).dispatchWorkgroups(wgX, wgY, wgZ);
    }

    recording.finish();
  }

  function destroy(): void {
    scanPlan.destroy();
    histBuffer.destroy();
    tempBuffer.destroy();
    tempValuesBuffer?.destroy();
    for (const buffer of paramBuffers) {
      buffer.destroy();
    }
  }

  return { size: n, run, destroy };
}
