import { tgpu, d, std } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import { ELEMENTS_PER_THREAD, type ScanSchemas, WORKGROUP_SIZE } from './schemas.ts';

export function makeScanKernel(schemas: ScanSchemas) {
  const { elementType, scanLayout, identitySlot, reduceOnlySlot, operatorSlot, workgroupMemory } =
    schemas;

  function upsweep(localIdx: number) {
    'use gpu';
    let offset = d.u32(1);
    for (let span = d.u32(WORKGROUP_SIZE / 2); span > 0; span >>= 1) {
      std.workgroupBarrier();
      if (localIdx < span) {
        const ai = offset * (2 * localIdx + 1) - 1;
        const bi = offset * (2 * localIdx + 2) - 1;
        workgroupMemory.$[bi] = operatorSlot.$(
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
      offset >>= 1;
      std.workgroupBarrier();
      if (localIdx < span) {
        const ai = offset * (2 * localIdx + 1) - 1;
        const bi = offset * (2 * localIdx + 2) - 1;
        const t = workgroupMemory.$[ai] as number;
        workgroupMemory.$[ai] = workgroupMemory.$[bi] as number;
        workgroupMemory.$[bi] = operatorSlot.$(workgroupMemory.$[bi] as number, t);
      }
    }
  }

  const fillIdentityArray = tgpu.comptime(() =>
    Array.from({ length: ELEMENTS_PER_THREAD }, () => identitySlot.$),
  );

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
      const localIdx = lid.x;
      const baseIdx = (workgroupId * WORKGROUP_SIZE + localIdx) * ELEMENTS_PER_THREAD;

      const partialSums = d.arrayOf(elementType, ELEMENTS_PER_THREAD)(fillIdentityArray());

      let prev = identitySlot.$;
      let lastIdx = d.u32(0);

      for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
        if (baseIdx + i < scanLayout.$.input.length) {
          partialSums[i] = operatorSlot.$(prev, scanLayout.$.input[baseIdx + i] as number);
          prev = partialSums[i];
          lastIdx = i;
        }
      }
      workgroupMemory.$[localIdx] = partialSums[lastIdx] as number;

      upsweep(localIdx);

      if (localIdx === 0 && workgroupId < scanLayout.$.sums.length) {
        scanLayout.$.sums[workgroupId] = workgroupMemory.$[WORKGROUP_SIZE - 1] as number;
        if (!reduceOnlySlot.$) {
          workgroupMemory.$[WORKGROUP_SIZE - 1] = identitySlot.$;
        }
      }

      if (!reduceOnlySlot.$) {
        downsweep(localIdx);

        std.workgroupBarrier();

        const scannedSum = workgroupMemory.$[localIdx];

        for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
          if (baseIdx + i < scanLayout.$.input.length) {
            if (i === 0) {
              scanLayout.$.input[baseIdx + i] = scannedSum;
            } else {
              scanLayout.$.input[baseIdx + i] = operatorSlot.$(
                scannedSum,
                partialSums[i - 1] as number,
              );
            }
          }
        }
      }
    },
  );
}

export function makeApplySumsKernel(schemas: ScanSchemas) {
  const { operatorSlot, applySumsLayout } = schemas;

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
      const baseIdx = (workgroupId * WORKGROUP_SIZE + lid.x) * ELEMENTS_PER_THREAD;
      const blockSum = applySumsLayout.$.sums[workgroupId];

      for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
        if (baseIdx + i < applySumsLayout.$.input.length) {
          (applySumsLayout.$.input[baseIdx + i] as number) = operatorSlot.$(
            blockSum as number,
            applySumsLayout.$.input[baseIdx + i] as number,
          );
        }
      }
    },
  );
}
