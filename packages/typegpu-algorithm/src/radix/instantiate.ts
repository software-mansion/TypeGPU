import type { d, StorageFlag, TgpuBuffer, TgpuRoot } from 'typegpu';
import {
  createLifecycle,
  type Dispatch,
  dispatchAll,
  initPipelinesAsync,
  initPipelinesSync,
} from '../instance.ts';
import { instantiate as instantiateScan } from '../scan/instantiate.ts';
import { decomposeWorkgroups } from '../workgroups.ts';
import { RADIX_BITS, RADIX_SIZE, TILE_SIZE } from './constants.ts';
import type { RadixKeyType } from './schemas.ts';
import type { RadixSortDefinition, RadixSortInstance, RadixSortIo } from './types.ts';

type KeyBuffer = TgpuBuffer<d.WgslArray<RadixKeyType>> & StorageFlag;
type ValueBuffer = TgpuBuffer<d.WgslArray<d.AnyWgslData>> & StorageFlag;

/**
 * Allocates the scratch buffers and bind groups for sorting `io.keys`. Validation and
 * allocation happen here, `step` only records dispatches.
 * @category Module
 */
export function instantiate<TKey extends RadixKeyType, TValue extends d.AnyWgslData>(
  root: TgpuRoot,
  definition: RadixSortDefinition,
  io: RadixSortIo<TKey, TValue>,
): RadixSortInstance {
  const keyBuffer = io.keys as KeyBuffer;
  const valueBuffer = io.values as ValueBuffer | undefined;
  const outKeys = (io.out?.keys ?? keyBuffer) as KeyBuffer;
  const outValues = (io.out ? io.out.values : valueBuffer) as ValueBuffer | undefined;
  const size = keyBuffer.dataType.elementCount;
  const { keyType, valueType, valueArray, numPasses } = definition;

  if (size === 0) {
    throw new Error('radixSort: cannot sort an empty buffer.');
  }
  if (keyBuffer.dataType.elementType !== keyType) {
    throw new Error(
      `radixSort: the keys buffer holds ${keyBuffer.dataType.elementType.type} elements, but the definition was made for ${keyType.type}.`,
    );
  }
  if ((valueBuffer === undefined) !== (valueType === undefined)) {
    throw new Error(
      valueType
        ? 'radixSort: the definition has a `valueType`, so `values` is required.'
        : 'radixSort: `values` requires a `valueType` in the definition.',
    );
  }
  if ((valueBuffer === undefined) !== (outValues === undefined)) {
    throw new Error('radixSort: sorting with values requires both `values` and `out.values`.');
  }
  for (const [name, buffer] of [
    ['values', valueBuffer],
    ['out.keys', outKeys],
    ['out.values', outValues],
  ] as const) {
    if (buffer && buffer.dataType.elementCount !== size) {
      throw new Error(
        `radixSort: the ${name} buffer (${buffer.dataType.elementCount} elements) must match the keys buffer (${size} elements).`,
      );
    }
  }

  const numTiles = Math.ceil(size / TILE_SIZE);
  const tileDispatch = decomposeWorkgroups(numTiles);
  const aliasesInput =
    outKeys.buffer === keyBuffer.buffer ||
    (valueBuffer !== undefined && outValues?.buffer === valueBuffer.buffer);
  const endsInTemp = aliasesInput && numPasses % 2 === 1;

  const histBuffer = root
    .createBuffer(definition.histArray(numTiles * RADIX_SIZE))
    .$usage('storage');
  const tempKeys = root.createBuffer(definition.keyArray(size)).$usage('storage') as KeyBuffer;
  const tempValues =
    valueArray && (root.createBuffer(valueArray(size)).$usage('storage') as ValueBuffer);
  const owned: { destroy(): void }[] = [histBuffer, tempKeys];
  if (tempValues) {
    owned.push(tempValues);
  }

  const scan = instantiateScan(root, definition.scan, { buffer: histBuffer });
  owned.push(scan);

  const histBg = root.createBindGroup(definition.histLayout, { hist: histBuffer });

  function bindIo(
    pipeline: RadixSortDefinition['count'],
    src: KeyBuffer,
    dst: KeyBuffer,
    srcVals: ValueBuffer | undefined,
    dstVals: ValueBuffer | undefined,
  ) {
    const bound = pipeline
      .with(histBg)
      .with(root.createBindGroup(definition.ioLayout, { src, dst }));
    return srcVals && dstVals
      ? bound.with(root.createBindGroup(definition.valuesLayout, { srcVals, dstVals }))
      : bound;
  }

  const passes = Array.from({ length: numPasses }, (_, pass) => {
    const toOut = (numPasses - 1 - pass) % 2 === (endsInTemp ? 1 : 0);
    const dst = toOut ? outKeys : tempKeys;
    const src = pass === 0 ? keyBuffer : toOut ? tempKeys : outKeys;
    const dstVals = toOut ? outValues : tempValues;
    const srcVals = pass === 0 ? valueBuffer : toOut ? tempValues : outValues;

    const shift = root.createBuffer(definition.shiftType, pass * RADIX_BITS).$usage('uniform');
    owned.push(shift);
    const shiftBg = root.createBindGroup(definition.shiftLayout, { shift });

    return {
      count: bindIo(definition.count, src, dst, undefined, undefined).with(shiftBg),
      scatter: bindIo(definition.scatter, src, dst, srcVals, dstVals).with(shiftBg),
    };
  });

  const finalCopy: Dispatch | undefined = endsInTemp
    ? {
        pipeline: bindIo(definition.copy, tempKeys, outKeys, tempValues, outValues),
        workgroups: tileDispatch,
      }
    : undefined;

  const pipelines = [definition.count, definition.scatter];
  if (finalCopy) {
    pipelines.push(definition.copy);
  }
  const lifecycle = createLifecycle('radixSort', owned);

  return {
    size,

    step(pass) {
      lifecycle.assertAlive('step');
      for (const { count, scatter } of passes) {
        dispatchAll(pass, [{ pipeline: count, workgroups: tileDispatch }]);
        scan.step(pass);
        dispatchAll(pass, [{ pipeline: scatter, workgroups: tileDispatch }]);
      }
      if (finalCopy) {
        dispatchAll(pass, [finalCopy]);
      }
    },

    initSync() {
      lifecycle.assertAlive('initSync');
      initPipelinesSync(pipelines);
      scan.initSync();
    },

    async initAsync() {
      lifecycle.assertAlive('initAsync');
      await Promise.all([initPipelinesAsync(pipelines), scan.initAsync()]);
    },

    destroy: lifecycle.destroy,
    [Symbol.dispose]: lifecycle.destroy,
  };
}
