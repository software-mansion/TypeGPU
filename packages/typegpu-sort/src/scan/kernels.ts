import { tgpu, d, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import { BLOCK_SIZE, ELEMENTS_PER_THREAD, type ScanSchemas, WORKGROUP_SIZE } from './schemas.ts';
import type { BinaryOp } from './types.ts';

/** Spreads tile slots so that per-thread strided reads hit distinct banks */
function padded(i: number): number {
  'use gpu';
  return i + (i >>> 5);
}

export function makeScanKernel(
  schemas: ScanSchemas,
  op: BinaryOp['operation'],
  identity: number,
  reduceOnly: boolean,
) {
  const { elementType, scanLayout, workgroupMemory, tile } = schemas;

  function upsweep(localIdx: number) {
    'use gpu';
    let offset = d.u32(1);
    for (let span = d.u32(WORKGROUP_SIZE / 2); span > 0; span >>>= 1) {
      std.workgroupBarrier();
      if (localIdx < span) {
        const ai = offset * (2 * localIdx + 1) - 1;
        const bi = offset * (2 * localIdx + 2) - 1;
        workgroupMemory.$[bi] = op(
          workgroupMemory.$[ai] as number,
          workgroupMemory.$[bi] as number,
        );
      }
      offset <<= 1;
    }
  }

  function downsweep(localIdx: number) {
    'use gpu';
    let offset = d.u32(WORKGROUP_SIZE);
    for (let span = d.u32(1); span < WORKGROUP_SIZE; span <<= 1) {
      offset >>>= 1;
      std.workgroupBarrier();
      if (localIdx < span) {
        const ai = offset * (2 * localIdx + 1) - 1;
        const bi = offset * (2 * localIdx + 2) - 1;
        const t = workgroupMemory.$[ai] as number;
        workgroupMemory.$[ai] = workgroupMemory.$[bi] as number;
        workgroupMemory.$[bi] = op(workgroupMemory.$[bi] as number, t);
      }
    }
  }

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
      const localIdx = lid.x;
      const tileBase = workgroupId * BLOCK_SIZE;
      const length = scanLayout.$.input.length;

      for (const k of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
        const idx = tileBase + k * WORKGROUP_SIZE + localIdx;
        let value = elementType(identity);
        if (idx < length) {
          value = scanLayout.$.input[idx] as number;
        }
        tile.$[padded(k * WORKGROUP_SIZE + localIdx)] = value;
      }
      std.workgroupBarrier();

      const partialSums = d.arrayOf(elementType, ELEMENTS_PER_THREAD)();
      let prev = elementType(identity);
      for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
        partialSums[i] = op(prev, tile.$[padded(localIdx * ELEMENTS_PER_THREAD + i)] as number);
        prev = partialSums[i];
      }
      workgroupMemory.$[localIdx] = prev;

      upsweep(localIdx);

      if (localIdx === 0 && workgroupId < scanLayout.$.sums.length) {
        scanLayout.$.sums[workgroupId] = workgroupMemory.$[WORKGROUP_SIZE - 1] as number;
        if (!reduceOnly) {
          workgroupMemory.$[WORKGROUP_SIZE - 1] = elementType(identity);
        }
      }

      if (!reduceOnly) {
        downsweep(localIdx);
        std.workgroupBarrier();

        const scannedSum = workgroupMemory.$[localIdx];
        tile.$[padded(localIdx * ELEMENTS_PER_THREAD)] = scannedSum;
        for (const i of tgpu.unroll(std.range(1, ELEMENTS_PER_THREAD))) {
          tile.$[padded(localIdx * ELEMENTS_PER_THREAD + i)] = op(
            scannedSum,
            partialSums[i - 1] as number,
          );
        }
        std.workgroupBarrier();

        for (const k of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
          const idx = tileBase + k * WORKGROUP_SIZE + localIdx;
          if (idx < length) {
            scanLayout.$.input[idx] = tile.$[padded(k * WORKGROUP_SIZE + localIdx)] as number;
          }
        }
      }
    },
  );
}

export function makeApplySumsKernel(schemas: ScanSchemas, op: BinaryOp['operation']) {
  const { applySumsLayout } = schemas;

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
      if (workgroupId >= applySumsLayout.$.sums.length) {
        return;
      }

      const tileBase = workgroupId * BLOCK_SIZE;
      const blockSum = applySumsLayout.$.sums[workgroupId] as number;

      for (const k of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
        const idx = tileBase + k * WORKGROUP_SIZE + lid.x;
        if (idx < applySumsLayout.$.input.length) {
          applySumsLayout.$.input[idx] = op(blockSum, applySumsLayout.$.input[idx] as number);
        }
      }
    },
  );
}
