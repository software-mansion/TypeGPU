import { tgpu, d, std, type StorageFlag, type TgpuBuffer, type TgpuRoot } from 'typegpu';
import { decomposeWorkgroups, dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import { beginRunPass, bindPass } from '../runPass.ts';
import { createPrefixScan } from '../scan/index.ts';
import type { RunOptions, Sorter } from '../types.ts';
import { makeCountKernel } from './count.ts';
import { normalizeKey } from './key.ts';
import { makeScatterKernel } from './scatter.ts';
import {
  histLayout,
  KEYS_PER_THREAD,
  makeRadixSchemas,
  RADIX_BITS,
  RADIX_SIZE,
  type RadixKeyType,
  type RadixSchemas,
  shiftLayout,
  TILE_SIZE,
  TILE_THREADS,
} from './schemas.ts';
import type { RadixSorterOptions } from './types.ts';

type KeyBuffer = TgpuBuffer<d.WgslArray<RadixKeyType>> & StorageFlag;
type ValueBuffer = TgpuBuffer<d.WgslArray<d.AnyWgslData>> & StorageFlag;

function makeCopyKernel(schemas: RadixSchemas, size: number, numTiles: number) {
  const { ioLayout, writeOutput } = schemas;

  return tgpu.computeFn({ workgroupSize: [TILE_THREADS], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const tileId = flatWorkgroupIndex(wid, numWorkgroups);
      if (tileId >= numTiles) {
        return;
      }

      const tileBase = tileId * TILE_SIZE;
      for (const k of tgpu.unroll(std.range(KEYS_PER_THREAD))) {
        const idx = tileBase + k * TILE_THREADS + lid.x;
        if (idx < size) {
          writeOutput(ioLayout.$.src[idx] as number, idx, idx);
        }
      }
    },
  );
}

/**
 * Creates a stable LSD radix sorter for a `u32`, `i32` or `f32` key buffer, optionally
 * reordering a payload buffer alongside the keys. All GPU resources are created up front,
 * so `run` only records dispatches.
 *
 * For `f32` keys, -0 and +0 compare equal.
 */
export function createRadixSorter<
  TKey extends RadixKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
>(
  root: TgpuRoot,
  keys: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag,
  options?: RadixSorterOptions<TKey, TValue>,
): Sorter {
  const keyBuffer = keys as KeyBuffer;
  const valueBuffer = options?.values as ValueBuffer | undefined;
  const outKeys = (options?.out?.keys ?? keyBuffer) as KeyBuffer;
  const outValues = (options?.out ? options.out.values : valueBuffer) as ValueBuffer | undefined;
  const keyType = keyBuffer.dataType.elementType;
  const size = keyBuffer.dataType.elementCount;
  const { keyBits, sortKey } = normalizeKey(keyType, options ?? {});

  if (size === 0) {
    throw new Error('Cannot create a radix sorter for an empty buffer.');
  }
  if ((valueBuffer === undefined) !== (outValues === undefined)) {
    throw new Error('Sorting with values requires both `values` and `out.values`.');
  }
  for (const [name, buffer] of [
    ['values', valueBuffer],
    ['out.keys', outKeys],
    ['out.values', outValues],
  ] as const) {
    if (buffer && buffer.dataType.elementCount !== size) {
      throw new Error(
        `The ${name} buffer (${buffer.dataType.elementCount} elements) must match the key buffer (${size} elements).`,
      );
    }
  }

  const schemas = makeRadixSchemas(keyType, sortKey, valueBuffer?.dataType.elementType);
  const numPasses = Math.ceil(keyBits / RADIX_BITS);
  const numTiles = Math.ceil(size / TILE_SIZE);
  const tileDispatch = decomposeWorkgroups(numTiles);
  const endsInTemp = outKeys === keyBuffer && numPasses % 2 === 1;

  const histBuffer = root.createBuffer(d.arrayOf(d.u32, numTiles * RADIX_SIZE)).$usage('storage');
  const tempKeys = root.createBuffer(d.arrayOf(keyType, size)).$usage('storage') as KeyBuffer;
  const tempValues =
    valueBuffer &&
    (root
      .createBuffer(d.arrayOf(valueBuffer.dataType.elementType, size))
      .$usage('storage') as ValueBuffer);
  const owned: { destroy(): void }[] = [histBuffer, tempKeys];
  if (tempValues) {
    owned.push(tempValues);
  }

  const scanPlan = createPrefixScan(root, histBuffer, { operation: std.add, identityElement: 0 });

  const histBg = root.createBindGroup(histLayout, { hist: histBuffer });
  const countPipeline = root
    .createComputePipeline({ compute: makeCountKernel(schemas, size, numTiles) })
    .with(histBg);
  const scatterPipeline = root
    .createComputePipeline({ compute: makeScatterKernel(schemas, size, numTiles) })
    .with(histBg);
  const copyPipeline = root.createComputePipeline({
    compute: makeCopyKernel(schemas, size, numTiles),
  });

  function ioBindGroups(
    src: KeyBuffer,
    dst: KeyBuffer,
    srcVals?: ValueBuffer,
    dstVals?: ValueBuffer,
  ) {
    const io = root.createBindGroup(schemas.ioLayout, { src, dst });
    const vals =
      srcVals && dstVals
        ? root.createBindGroup(schemas.valuesLayout, { srcVals, dstVals })
        : undefined;
    return { io, vals };
  }

  const passes = Array.from({ length: numPasses }, (_, pass) => {
    const toOut = (numPasses - 1 - pass) % 2 === (endsInTemp ? 1 : 0);
    const dst = toOut ? outKeys : tempKeys;
    const src = pass === 0 ? keyBuffer : toOut ? tempKeys : outKeys;
    const dstVals = toOut ? outValues : tempValues;
    const srcVals = pass === 0 ? valueBuffer : toOut ? tempValues : outValues;
    const { io, vals } = ioBindGroups(src, dst, srcVals, dstVals);

    const shift = root.createBuffer(d.u32, pass * RADIX_BITS).$usage('uniform');
    owned.push(shift);
    const shiftBg = root.createBindGroup(shiftLayout, { shift });

    const scatter = scatterPipeline.with(io).with(shiftBg);
    return {
      count: countPipeline.with(io).with(shiftBg),
      scatter: vals ? scatter.with(vals) : scatter,
    };
  });

  const finalCopy = endsInTemp
    ? (() => {
        const { io, vals } = ioBindGroups(tempKeys, outKeys, tempValues, outValues);
        return vals ? copyPipeline.with(io).with(vals) : copyPipeline.with(io);
      })()
    : undefined;

  const pipelines = [countPipeline, scatterPipeline, ...(finalCopy ? [copyPipeline] : [])];

  return {
    size,

    initSync(): void {
      for (const pipeline of pipelines) {
        pipeline.initSync();
      }
      scanPlan.initSync();
    },

    async initAsync(): Promise<void> {
      await Promise.all([...pipelines.map((p) => p.initAsync()), scanPlan.initAsync()]);
    },

    run(runOptions?: RunOptions): void {
      const recording = beginRunPass(root.device, runOptions);
      for (const { count, scatter } of passes) {
        bindPass(count, recording.pass).dispatchWorkgroups(...tileDispatch);
        scanPlan.run({ pass: recording.pass });
        bindPass(scatter, recording.pass).dispatchWorkgroups(...tileDispatch);
      }
      if (finalCopy) {
        bindPass(finalCopy, recording.pass).dispatchWorkgroups(...tileDispatch);
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
