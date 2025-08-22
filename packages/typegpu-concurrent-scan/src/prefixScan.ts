import type {
  StorageFlag,
  TgpuBuffer,
  TgpuComputePipeline,
  TgpuQuerySet,
  TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import {
  type BinaryOp,
  identitySlot,
  operatorSlot,
  scanLayout,
  uniformAddLayout,
  workgroupSize,
} from './schemas.ts';
import { scanBlock } from './compute/scan.ts';
import { uniformAdd } from './compute/applySums.ts';
import { scanGreatestBlock } from './compute/singleScan.ts';

const cache = new WeakMap<TgpuRoot, WeakMap<BinaryOp, PrefixScanComputer>>();

class PrefixScanComputer {
  #scanPipeline?: TgpuComputePipeline;
  #addPipeline?: TgpuComputePipeline;
  #scratchBuffers: Map<number, TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag> =
    new Map();
  #querySet: TgpuQuerySet<'timestamp'> | null = null;
  #first = true;
  #timeCallback?:
    | ((timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void)
    | undefined;

  constructor(
    private root: TgpuRoot,
    private binaryOp: BinaryOp,
    private onlyGreatestElement: boolean,
    timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
  ) {
    this.#timeCallback = timeCallback;
    this.#querySet = root.createQuerySet('timestamp', 2);
  }

  updateTimeCallback(
    timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
  ): void {
    this.#timeCallback = timeCallback;
  }

  private get scanPipeline(): TgpuComputePipeline {
    if (!this.#scanPipeline) {
      this.#scanPipeline = this.root['~unstable']
        .with(operatorSlot, this.binaryOp.operation as d.TgpuCallable)
        .with(identitySlot, this.binaryOp.identityElement)
        .withCompute(this.onlyGreatestElement ? scanGreatestBlock : scanBlock)
        .createPipeline();
    }
    return this.#scanPipeline;
  }

  private get addPipeline(): TgpuComputePipeline {
    if (!this.#addPipeline) {
      this.#addPipeline = this.root['~unstable']
        .with(operatorSlot, this.binaryOp.operation as d.TgpuCallable)
        .withCompute(uniformAdd)
        .createPipeline();
    }
    return this.#addPipeline;
  }

  private getScratchBuffer(
    size: number,
    level: number,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const key = (level << 20) | size;
    if (!this.#scratchBuffers.has(key)) {
      this.#scratchBuffers.set(
        key,
        this.root.createBuffer(d.arrayOf(d.f32, size)).$usage('storage'),
      );
    }
    return this.#scratchBuffers.get(key) as
      & TgpuBuffer<d.WgslArray<d.F32>>
      & StorageFlag;
  }

  private recursiveScan(
    buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    actualLength: number,
    level = 0,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const numWorkgroups = Math.ceil(actualLength / (workgroupSize * 8));

    // Base case: single workgroup
    if (numWorkgroups === 1) {
      const dummySums = this.getScratchBuffer(1, level);
      const bg = this.root.createBindGroup(scanLayout, {
        input: buffer,
        sums: dummySums,
      });
      this.scanPipeline
        .with(scanLayout, bg)
        .withTimestampWrites({
          querySet: this.#querySet as TgpuQuerySet<'timestamp'>,
          beginningOfPassWriteIndex: this.#first
            ? 0
            : (undefined as unknown as number),
          endOfPassWriteIndex: 1,
        })
        .dispatchWorkgroups(1);

      if (this.onlyGreatestElement) {
        return dummySums;
      }
      return buffer;
    }
    // Recursive case:
    let sumsBuffer = this.getScratchBuffer(numWorkgroups, level);

    // Up-scan & Down-scan
    const scanBg = this.root.createBindGroup(scanLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    if (this.#first) {
      this.scanPipeline
        .with(scanLayout, scanBg)
        .withTimestampWrites({
          querySet: this.#querySet as TgpuQuerySet<'timestamp'>,
          beginningOfPassWriteIndex: 0,
        })
        .dispatchWorkgroups(numWorkgroups);
      this.#first = false;
    } else {
      this.scanPipeline
        .with(scanLayout, scanBg)
        .dispatchWorkgroups(numWorkgroups);
    }

    // Recursively scan the sums
    sumsBuffer = this.recursiveScan(sumsBuffer, numWorkgroups, level + 1);

    if (this.onlyGreatestElement) {
      return sumsBuffer;
    }
    // Add the scanned sums back
    const addBg = this.root.createBindGroup(uniformAddLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    this.addPipeline
      .with(uniformAddLayout, addBg)
      .withTimestampWrites({
        querySet: this.#querySet as TgpuQuerySet<'timestamp'>,
        endOfPassWriteIndex: 1,
      })
      .dispatchWorkgroups(numWorkgroups);
    return buffer;
  }

  compute(
    buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const numWorkgroups = Math.ceil(
      buffer.dataType.elementCount / (workgroupSize * 8),
    );

    const result = this.recursiveScan(buffer, buffer.dataType.elementCount);
    this.root['~unstable'].flush();

    this.#querySet?.resolve();
    if (this.#timeCallback && this.#querySet) {
      this.#timeCallback(this.#querySet);
    }
    return result;
  }
}

export function prefixScan(
  root: TgpuRoot,
  buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  binaryOp: BinaryOp,
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  let computer = cache.get(root)?.get(binaryOp);
  if (!computer) {
    computer = initCache(root, binaryOp, false);
  }

  if (timeCallback) {
    (computer as PrefixScanComputer).updateTimeCallback(timeCallback);
  }

  return computer.compute(buffer);
}

export function scan(
  root: TgpuRoot,
  buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  binaryOp: BinaryOp,
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  let computer = cache.get(root)?.get(binaryOp);
  if (!computer) {
    computer = initCache(root, binaryOp, true);
  }

  if (timeCallback) {
    (computer as PrefixScanComputer).updateTimeCallback(timeCallback);
  }

  return computer.compute(buffer);
}

export function initCache(
  root: TgpuRoot,
  binaryOp: BinaryOp,
  onlyGreatestElement = false,
): PrefixScanComputer {
  let rootCache = cache.get(root);
  if (!rootCache) {
    rootCache = new WeakMap();
    cache.set(root, rootCache);
  }
  if (!rootCache.has(binaryOp)) {
    rootCache.set(
      binaryOp,
      new PrefixScanComputer(root, binaryOp, onlyGreatestElement),
    );
  }
  return rootCache.get(binaryOp) as PrefixScanComputer;
}
