import { tgpu, d, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';

/** The default `maxComputeWorkgroupStorageSize`, which the per-thread totals have to fit in. */
const WORKGROUP_STORAGE_BYTES = 16384;

export type Operation = (a: unknown, b: unknown) => unknown;
export type Copy = (value: unknown) => unknown;

export function elementConstant(elementType: d.AnyWgslData, value: unknown) {
  return (tgpu.const as (schema: d.AnyWgslData, value: unknown) => { $: unknown })(
    elementType,
    value,
  );
}

interface ScanIo {
  $: { input: unknown[]; sums: unknown[]; count: number };
}

export function makeElementScanSchemas(elementType: d.AnyWgslData) {
  const elementSize = d.sizeOf(elementType);
  let workgroupSize = 256;
  while (workgroupSize > 16 && workgroupSize * elementSize > WORKGROUP_STORAGE_BYTES) {
    workgroupSize /= 2;
  }
  if (workgroupSize * elementSize > WORKGROUP_STORAGE_BYTES) {
    throw new Error(`Cannot scan elements of ${elementSize} bytes, the limit is 1024.`);
  }
  const elementsPerThread = elementSize <= 16 ? 8 : 4;

  return {
    elementType,
    workgroupSize,
    elementsPerThread,
    blockSize: workgroupSize * elementsPerThread,
    scanLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'mutable' },
      sums: { storage: d.arrayOf(elementType), access: 'mutable' },
      // A buffer of 2-byte elements is padded to 4 bytes, so `arrayLength` can be one too many.
      count: { uniform: d.u32 },
    }),
    applySumsLayout: tgpu.bindGroupLayout({
      input: { storage: d.arrayOf(elementType), access: 'mutable' },
      sums: { storage: d.arrayOf(elementType), access: 'readonly' },
    }),
    workgroupMemory: tgpu.workgroupVar(d.arrayOf(elementType, workgroupSize)),
  };
}

export type ElementScanSchemas = ReturnType<typeof makeElementScanSchemas>;

/**
 * Unlike the scalar kernel, a thread reads its elements straight from the buffer, so the
 * workgroup memory only holds one total per thread and structs of up to 1024 bytes fit.
 */
export function makeElementScanKernel(
  schemas: ElementScanSchemas,
  operation: unknown,
  identityElement: unknown,
  reduceOnly: boolean,
) {
  const { elementType, workgroupSize, elementsPerThread, blockSize } = schemas;
  const op = operation as Operation;
  const copy = elementType as unknown as Copy;
  const io = schemas.scanLayout as unknown as ScanIo;
  const totals = schemas.workgroupMemory as unknown as { $: unknown[] };
  const identity = elementConstant(elementType, identityElement);

  function upsweep(localIdx: number) {
    'use gpu';
    let offset = d.u32(1);
    for (let span = d.u32(workgroupSize / 2); span > 0; span >>>= 1) {
      std.workgroupBarrier();
      if (localIdx < span) {
        const ai = offset * (2 * localIdx + 1) - 1;
        const bi = offset * (2 * localIdx + 2) - 1;
        totals.$[bi] = op(copy(totals.$[ai]), copy(totals.$[bi]));
      }
      offset <<= 1;
    }
  }

  function downsweep(localIdx: number) {
    'use gpu';
    let offset = d.u32(workgroupSize);
    for (let span = d.u32(1); span < workgroupSize; span <<= 1) {
      offset >>>= 1;
      std.workgroupBarrier();
      if (localIdx < span) {
        const ai = offset * (2 * localIdx + 1) - 1;
        const bi = offset * (2 * localIdx + 2) - 1;
        const left = copy(totals.$[ai]);
        totals.$[ai] = copy(totals.$[bi]);
        totals.$[bi] = op(copy(totals.$[bi]), left);
      }
    }
  }

  return tgpu.computeFn({ workgroupSize: [workgroupSize], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
      const localIdx = lid.x;
      const first = workgroupId * blockSize + localIdx * elementsPerThread;
      const length = io.$.count;

      const before = d.arrayOf(elementType, elementsPerThread)();
      let running = copy(identity.$);
      for (const i of tgpu.unroll(std.range(elementsPerThread))) {
        if (!reduceOnly) {
          before[i] = copy(running);
        }
        if (first + i < length) {
          running = op(running, copy(io.$.input[first + i]));
        }
      }
      totals.$[localIdx] = copy(running);

      upsweep(localIdx);

      if (localIdx === 0 && workgroupId < io.$.sums.length) {
        io.$.sums[workgroupId] = copy(totals.$[workgroupSize - 1]);
      }

      if (!reduceOnly) {
        if (localIdx === 0) {
          totals.$[workgroupSize - 1] = copy(identity.$);
        }
        downsweep(localIdx);
        std.workgroupBarrier();

        const scannedSum = copy(totals.$[localIdx]);
        for (const i of tgpu.unroll(std.range(elementsPerThread))) {
          if (first + i < length) {
            io.$.input[first + i] = op(scannedSum, copy(before[i]));
          }
        }
      }
    },
  );
}

export function makeElementApplySumsKernel(schemas: ElementScanSchemas, operation: unknown) {
  const { elementType, workgroupSize, elementsPerThread, blockSize } = schemas;
  const op = operation as Operation;
  const copy = elementType as unknown as Copy;
  const io = schemas.applySumsLayout as unknown as { $: { input: unknown[]; sums: unknown[] } };

  return tgpu.computeFn({ workgroupSize: [workgroupSize], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
      if (workgroupId >= io.$.sums.length) {
        return;
      }

      const first = workgroupId * blockSize + lid.x * elementsPerThread;
      const blockSum = copy(io.$.sums[workgroupId]);

      for (const i of tgpu.unroll(std.range(elementsPerThread))) {
        if (first + i < io.$.input.length) {
          io.$.input[first + i] = op(blockSum, copy(io.$.input[first + i]));
        }
      }
    },
  );
}
