/** biome-ignore-all lint/suspicious/noExtraNonNullAssertion: no! */
/** biome-ignore-all lint/style/noNonNullAssertion: no! */
import tgpu, {
  type StorageFlag,
  type TgpuBuffer,
  type TgpuComputePipeline,
  type TgpuQuerySet,
  type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const workgroupSize = 256;
const workgroupMemory = tgpu['~unstable'].workgroupVar(
  d.arrayOf(d.f32, workgroupSize),
);

const scanLayout = tgpu.bindGroupLayout({
  input: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
  sums: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
});

const scanBlock = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationId,
    nwg: d.builtin.numWorkgroups,
    wid: d.builtin.workgroupId,
  },
})(({ gid, lid, nwg, wid }) => {
  const globalIdx = gid.x + gid.y * nwg.x + gid.z * nwg.x * nwg.y;
  const globalWid = wid.x + wid.y * nwg.x + wid.z * nwg.x * nwg.y;
  const localIdx = lid.x;
  const arrayLength = scanLayout.$.input.length;
  let offset = d.u32(1);

  // Each thread processes 8 elements
  const baseIdx = globalIdx * 8;

  const elements = [d.f32(0), 0, 0, 0, 0, 0, 0, 0];
  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < arrayLength) {
      elements[i] = scanLayout.$.input[baseIdx + i]!;
    }
  }

  const partialSums = [d.f32(0), 0, 0, 0, 0, 0, 0, 0];
  partialSums[0] = elements[0]!;
  for (let i = d.u32(1); i < 8; i++) {
    partialSums[i] = partialSums[i - 1]! + elements[i]!;
  }
  const totalSum = partialSums[7];

  // Store the total sum in shared memory
  workgroupMemory.$[localIdx] = totalSum!;

  // Upsweep - tree-based scan on shared memory
  for (let d_val = d.u32(workgroupSize / 2); d_val > 0; d_val >>= 1) {
    std.workgroupBarrier();
    if (localIdx < d_val) {
      const ai = offset * (2 * localIdx + 1) - 1;
      const bi = offset * (2 * localIdx + 2) - 1;
      workgroupMemory.$[bi]! += workgroupMemory.$[ai]!;
    }
    offset <<= 1;
  }

  if (localIdx === 0) {
    scanLayout.$.sums[globalWid]! = workgroupMemory.$[workgroupSize - 1]!;
    workgroupMemory.$[workgroupSize - 1] = d.f32(0);
  }

  // Downsweep
  for (let d_val = d.u32(1); d_val < workgroupSize; d_val <<= 1) {
    offset >>= 1;
    std.workgroupBarrier();
    if (localIdx < d_val) {
      const ai = offset * (2 * localIdx + 1) - 1;
      const bi = offset * (2 * localIdx + 2) - 1;
      const t = workgroupMemory.$[ai]!;
      workgroupMemory.$[ai]! = workgroupMemory.$[bi]!;
      workgroupMemory.$[bi]! += t;
    }
  }

  std.workgroupBarrier();

  // Add the scanned sum from shared memory to partial sums and write back
  const scannedSum = workgroupMemory.$[localIdx]!;

  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < arrayLength) {
      if (i === 0) {
        scanLayout.$.input[baseIdx + i]! = scannedSum;
      } else {
        scanLayout.$.input[baseIdx + i]! = scannedSum + partialSums[i - 1]!;
      }
    }
  }
});

const uniformAddLayout = tgpu.bindGroupLayout({
  input: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'mutable' },
  sums: { storage: (n: number) => d.arrayOf(d.f32, n), access: 'readonly' },
});

const uniformAdd = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
    wid: d.builtin.workgroupId,
  },
})(({ gid, nwg, wid }) => {
  const globalIdx = gid.x + gid.y * nwg.x + gid.z * nwg.x * nwg.y;
  const workgroupId = wid.x + wid.y * nwg.x + wid.z * nwg.x * nwg.y;
  const baseIdx = globalIdx * 8;
  const sumValue = uniformAddLayout.$.sums[workgroupId]!;

  // Add the sum to all 8 elements processed by this thread
  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < uniformAddLayout.$.input.length) {
      uniformAddLayout.$.input[baseIdx + i]! += sumValue;
    }
  }
});

class PrefixSumComputer {
  private root: TgpuRoot;
  private scanPipeline?: TgpuComputePipeline;
  private addPipeline?: TgpuComputePipeline;
  private scratchBuffers: Map<
    number,
    TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag
  > = new Map();
  private qs: TgpuQuerySet<'timestamp'> | null = null;
  private first = true;

  constructor(root: TgpuRoot) {
    this.root = root;
    this.qs = root.createQuerySet('timestamp', 2);
  }

  private getScanPipeline(): TgpuComputePipeline {
    if (!this.scanPipeline) {
      this.scanPipeline = this.root['~unstable'].withCompute(scanBlock)
        .createPipeline();
    }
    return this.scanPipeline;
  }

  private getAddPipeline(): TgpuComputePipeline {
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

    // Base case: single workgroup can handle everything
    if (numWorkgroups === 1) {
      const dummySums = this.getScratchBuffer(1, level);
      const bg = this.root.createBindGroup(scanLayout, {
        input: buffer,
        sums: dummySums,
      });
      this.getScanPipeline().with(scanLayout, bg).withTimestampWrites({
        querySet: this.qs!,
        beginningOfPassWriteIndex: this.first
          ? 0
          : undefined as unknown as number,
        endOfPassWriteIndex: 1,
      }).dispatchWorkgroups(1);
      return;
    }

    // Recursive case: need to process sums
    const sumsBuffer = this.getScratchBuffer(numWorkgroups, level);

    // Step 1: Scan each workgroup and collect sums
    const scanBg = this.root.createBindGroup(scanLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    if (this.first) {
      this.getScanPipeline().with(scanLayout, scanBg).withTimestampWrites({
        querySet: this.qs!,
        beginningOfPassWriteIndex: 0,
      }).dispatchWorkgroups(
        numWorkgroups,
      );
      this.first = false;
    } else {
      this.getScanPipeline().with(scanLayout, scanBg).dispatchWorkgroups(
        numWorkgroups,
      );
    }

    // Step 2: Recursively scan the sums
    this.recursiveScan(sumsBuffer, numWorkgroups, level + 1);

    // Step 3: Add the scanned sums back to the original data
    const addBg = this.root.createBindGroup(uniformAddLayout, {
      input: buffer,
      sums: sumsBuffer,
    });
    this.getAddPipeline().with(uniformAddLayout, addBg).dispatchWorkgroups(
      numWorkgroups,
    );
  }

  compute(values: number[]): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
    const numWorkgroups = Math.ceil(values.length / (workgroupSize * 8));
    const lengthPadded = numWorkgroups * workgroupSize * 8;

    const valuesBuffer = this.root.createBuffer(
      d.arrayOf(d.f32, lengthPadded),
      [
        ...values,
        ...Array(lengthPadded - values.length).fill(0),
      ],
    ).$usage('storage');

    // Perform recursive prefix sum
    this.recursiveScan(valuesBuffer, values.length);

    this.root['~unstable'].flush();

    this.qs?.resolve();
    this.qs?.read().then((timestamps) => {
      const diff = Number(timestamps[1]! - timestamps[0]!) / 1_000_000;
      console.log(`Prefix sum computed in ${diff} ms`);
    });

    return valuesBuffer;
  }
}

export function concurrentSum(
  root: TgpuRoot,
  values: number[],
): TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag {
  const computer = new PrefixSumComputer(root);
  const result = computer.compute(values);

  return result;
}
