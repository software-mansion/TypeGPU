import type { TgpuRoot } from 'typegpu';
import {
  createLifecycle,
  type Dispatch,
  dispatchAll,
  initPipelinesAsync,
  initPipelinesSync,
} from '../instance.ts';
import { decomposeWorkgroups } from '../workgroups.ts';
import { BLOCK_SIZE } from './constants.ts';
import type { ScanElementType } from './schemas.ts';
import type {
  PrefixScanDefinition,
  PrefixScanInstance,
  PrefixScanIo,
  ScanBuffer,
} from './types.ts';

/** Instantiates a scan whose result buffer is optionally left alive by `destroy` */
export function instantiateScan<TElement extends ScanElementType>(
  root: TgpuRoot,
  definition: PrefixScanDefinition<TElement>,
  io: PrefixScanIo<TElement>,
  ownsResult: boolean,
): PrefixScanInstance<TElement> {
  const buffer = io.buffer as ScanBuffer;
  const def = definition as unknown as PrefixScanDefinition;
  if (buffer.dataType.elementType !== definition.elementType) {
    throw new Error(
      `prefixScan: the buffer holds ${buffer.dataType.elementType.type} elements, but the definition was made for ${definition.elementType.type}.`,
    );
  }
  if (buffer.dataType.elementCount === 0) {
    throw new Error('prefixScan: cannot scan an empty buffer.');
  }

  const { scanLayout, applySumsLayout, scan, applySums } = def;
  const dispatches: Dispatch[] = [];
  const scratch: ScanBuffer[] = [];
  const applyLevels: { target: ScanBuffer; sums: ScanBuffer; numWorkgroups: number }[] = [];

  let current: ScanBuffer = buffer;
  let resultBuffer: ScanBuffer = buffer;

  for (;;) {
    const numWorkgroups = Math.ceil(current.dataType.elementCount / BLOCK_SIZE);
    const sums: ScanBuffer = root.createBuffer(def.sumsArray(numWorkgroups)).$usage('storage');
    scratch.push(sums);

    dispatches.push({
      pipeline: scan.with(root.createBindGroup(scanLayout, { input: current, sums })),
      workgroups: decomposeWorkgroups(numWorkgroups),
    });

    if (numWorkgroups === 1) {
      if (def.reduceOnly) {
        resultBuffer = sums;
      }
      break;
    }

    applyLevels.push({ target: current, sums, numWorkgroups });
    current = sums;
  }

  if (applySums) {
    for (const level of applyLevels.toReversed()) {
      dispatches.push({
        pipeline: applySums.with(
          root.createBindGroup(applySumsLayout, { input: level.target, sums: level.sums }),
        ),
        workgroups: decomposeWorkgroups(level.numWorkgroups),
      });
    }
  }

  const pipelines = applySums && applyLevels.length > 0 ? [scan, applySums] : [scan];
  const lifecycle = createLifecycle(
    'prefixScan',
    ownsResult ? scratch : scratch.filter((b) => b !== resultBuffer),
  );

  return {
    resultBuffer: resultBuffer as unknown as ScanBuffer<TElement>,

    step(pass) {
      lifecycle.assertAlive('step');
      dispatchAll(pass, dispatches);
    },

    initSync() {
      lifecycle.assertAlive('initSync');
      initPipelinesSync(pipelines);
    },

    async initAsync() {
      lifecycle.assertAlive('initAsync');
      await initPipelinesAsync(pipelines);
    },

    destroy: lifecycle.destroy,
    [Symbol.dispose]: lifecycle.destroy,
  };
}

/**
 * Allocates the scratch buffers and bind groups for scanning `io.buffer` in place, or reducing
 * it into `resultBuffer`. Validation and allocation happen here, `step` only records.
 * @category Module
 */
export function instantiate<TElement extends ScanElementType>(
  root: TgpuRoot,
  definition: PrefixScanDefinition<TElement>,
  io: PrefixScanIo<TElement>,
): PrefixScanInstance<TElement> {
  return instantiateScan(root, definition, io, true);
}
