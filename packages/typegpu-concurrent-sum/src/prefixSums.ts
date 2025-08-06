import tgpu, {
  type StorageFlag,
  type TgpuBuffer,
  type TgpuComputePipeline,
  TgpuFn,
  type TgpuQuerySet,
  type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import {
  identitySlot,
  operatorSlot,
  scanLayout,
  uniformAddLayout,
  workgroupSize,
} from './schemas.ts';
import { scanBlock } from './compute/scan.ts';
import { uniformAdd } from './compute/applySums.ts';

let computer: PrefixSumComputer | null = null;

export class PrefixSumComputer {
  private scanPipeline?: TgpuComputePipeline;
  private addPipeline?: TgpuComputePipeline;
  private scratchBuffers: Map<
    number,
    TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag
  > = new Map();
  private qs: TgpuQuerySet<'timestamp'> | null = null;
  private first = true;

  constructor(
    private root: TgpuRoot,
    private operatorFn: (x: number, y: number) => number,
    private identity: number,
  ) {
    this.root = root;
    this.qs = root.createQuerySet('timestamp', 2);
  }

  private get ScanPipeline(): TgpuComputePipeline {
    if (!this.scanPipeline) {
      this.scanPipeline = this.root['~unstable'].with(
        operatorSlot,
        this.operatorFn as unknown as TgpuFn,
      ).with(identitySlot, this.identity)
        .withCompute(scanBlock)
        .createPipeline();
    }
    return this.scanPipeline;
  }

  private get AddPipeline(): TgpuComputePipeline {
    if (!this.addPipeline) {
      this.addPipeline = this.root['~unstable'].withCompute(uniformAdd)
        .createPipeline();
    }
    return this.addPipeline;
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
    return this.scratchBuffers.get(key)!;
  }

  private recursiveScan(
    buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    actualLength: number,
    level: number = 0,
  ): void {
    const numWorkgroups = Math.ceil(actualLength / (workgroupSize * 8));

    // Base case: single workgroup
    if (numWorkgroups === 1) {
      const dummySums = this.getScratchBuffer(1, level);
      const bg = this.root.createBindGroup(scanLayout, {
        input: buffer,
        sums: dummySums,
      });
      this.ScanPipeline.with(scanLayout, bg).withTimestampWrites({
        querySet: this.qs!,
        beginningOfPassWriteIndex: this.first
          ? 0
          : undefined as unknown as number,
        endOfPassWriteIndex: 1,
      }).dispatchWorkgroups(1);
      return;
    }

    // Recursive case:
    const sumsBuffer = this.getScratchBuffer(numWorkgroups, level);

    // Up-scan & Down-scan
    const scanBg = this.root.createBindGroup(scanLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    if (this.first) {
      this.ScanPipeline.with(scanLayout, scanBg).withTimestampWrites({
        querySet: this.qs!,
        beginningOfPassWriteIndex: 0,
      }).dispatchWorkgroups(
        numWorkgroups,
      );
      this.first = false;
    } else {
      this.ScanPipeline.with(scanLayout, scanBg).dispatchWorkgroups(
        numWorkgroups,
      );
    }

    // Recursively scan the sums
    this.recursiveScan(sumsBuffer, numWorkgroups, level + 1);

    // Add the scanned sums back
    const addBg = this.root.createBindGroup(uniformAddLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    this.AddPipeline.with(uniformAddLayout, addBg).withTimestampWrites({
      querySet: this.qs!,
      endOfPassWriteIndex: 1,
    }).dispatchWorkgroups(
      numWorkgroups,
    );
  }

  compute(
    buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  ): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const numWorkgroups = Math.ceil(
      buffer.dataType.elementCount / (workgroupSize * 8),
    );

    this.recursiveScan(buffer, buffer.dataType.elementCount);
    this.root['~unstable'].flush();

    this.qs?.resolve();
    this.qs?.read().then((timestamps) => {
      const diff = Number(timestamps[1]! - timestamps[0]!) / 1_000_000;
      console.log(`Prefix sum computed in ${diff} ms`);
    });

    return buffer;
  }
}

export function initConcurrentSum(
  root: TgpuRoot,
  operatorFn: (x: number, y: number) => number,
  identity: number,
): void {
  // allocate all resources ahead of demand
  computer = new PrefixSumComputer(root, operatorFn, identity);
}

export function concurrentSum(
  root: TgpuRoot,
  buffer: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  operatorFn: (x: number, y: number) => number,
  identity: number,
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  computer ??= new PrefixSumComputer(root, operatorFn, identity);
  const result = computer.compute(buffer);

  return result;
}
