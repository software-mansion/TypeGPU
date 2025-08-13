import type {
  StorageFlag,
  TgpuBuffer,
  TgpuComputePipeline,
  TgpuFn,
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
  private _scanPipeline?: TgpuComputePipeline;
  private _addPipeline?: TgpuComputePipeline;
  private scratchBuffers: Map<
    number,
    TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag
  > = new Map();
  private querySet: TgpuQuerySet<'timestamp'> | null = null;
  private first = true;

  constructor(
    private root: TgpuRoot,
    private binaryOp: BinaryOp,
    private onlyGreatestElement: boolean,
    private timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
  ) {
    this.querySet = root.createQuerySet('timestamp', 2);
  }

  private get scanPipeline(): TgpuComputePipeline {
    if (!this._scanPipeline) {
      this._scanPipeline = this.root['~unstable'].with(
        operatorSlot,
        this.binaryOp.operation as unknown as TgpuFn,
      ).with(identitySlot, this.binaryOp.identityElement)
        .withCompute(this.onlyGreatestElement ? scanGreatestBlock : scanBlock)
        .createPipeline();
    }
    return this._scanPipeline;
  }

  private get addPipeline(): TgpuComputePipeline {
    if (!this._addPipeline) {
      this._addPipeline = this.root['~unstable'].with(
        operatorSlot,
        this.binaryOp.operation as unknown as TgpuFn,
      ).withCompute(uniformAdd)
        .createPipeline();
    }
    return this._addPipeline;
  }

  private getScratchBuffer(
    size: number,
    level: number,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const key = (level << 20) | size;
    if (!this.scratchBuffers.has(key)) {
      this.scratchBuffers.set(
        key,
        this.root.createBuffer(d.arrayOf(d.f32, size)).$usage('storage'),
      );
    }
    return this.scratchBuffers.get(key) as
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
      this.scanPipeline.with(scanLayout, bg).withTimestampWrites({
        querySet: this.querySet as TgpuQuerySet<'timestamp'>,
        beginningOfPassWriteIndex: this.first
          ? 0
          : undefined as unknown as number,
        endOfPassWriteIndex: 1,
      }).dispatchWorkgroups(1);

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
    if (this.first) {
      this.scanPipeline.with(scanLayout, scanBg).withTimestampWrites({
        querySet: this.querySet as TgpuQuerySet<'timestamp'>,
        beginningOfPassWriteIndex: 0,
      }).dispatchWorkgroups(
        numWorkgroups,
      );
      this.first = false;
    } else {
      this.scanPipeline.with(scanLayout, scanBg).dispatchWorkgroups(
        numWorkgroups,
      );
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
    this.addPipeline.with(uniformAddLayout, addBg).withTimestampWrites({
      querySet: this.querySet as TgpuQuerySet<'timestamp'>,
      endOfPassWriteIndex: 1,
    }).dispatchWorkgroups(
      numWorkgroups,
    );
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

    this.querySet?.resolve();
    if (this.timeCallback && this.querySet) {
      this.timeCallback(this.querySet);
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
    computer = new PrefixScanComputer(
      root,
      binaryOp,
      false,
      timeCallback,
    );

    if (!cache.has(root)) {
      cache.set(root, new WeakMap());
    }
    cache.get(root).set(binaryOp, computer);
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
    computer = new PrefixScanComputer(
      root,
      binaryOp,
      true,
      timeCallback,
    );

    if (!cache.has(root)) {
      cache.set(root, new WeakMap());
    }
    cache.get(root).set(binaryOp, computer);
  }

  return computer.compute(buffer);
}

// too much is being cached
// new values need to be passed to function not class
// create weak map
