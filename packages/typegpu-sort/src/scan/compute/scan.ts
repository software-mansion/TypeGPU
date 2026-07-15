import { tgpu, d, std } from 'typegpu';
import { flatWorkgroupIndex } from '../../wgslUtils.ts';
import { ELEMENTS_PER_THREAD, type ScanSchemas, WORKGROUP_SIZE } from '../schemas.ts';
import { makeShared } from './shared.ts';

export function makeComputeBlock(schemas: ScanSchemas) {
  const {
    elementType,
    scanLayout,
    identitySlot,
    onlyGreatestElementSlot,
    operatorSlot,
    workgroupMemory,
  } = schemas;
  const { upsweep, downsweep } = makeShared(schemas);

  const fillIdentityArray = tgpu.comptime(() =>
    Array.from({ length: ELEMENTS_PER_THREAD }, () => identitySlot.$),
  );

  return tgpu.computeFn({
    workgroupSize: [WORKGROUP_SIZE],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
    },
  })(({ lid, wid, numWorkgroups }) => {
    const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
    const localIdx = lid.x;

    const baseIdx = (workgroupId * WORKGROUP_SIZE + localIdx) * ELEMENTS_PER_THREAD;

    const partialSums = d.arrayOf(elementType, ELEMENTS_PER_THREAD)(fillIdentityArray());

    let prev = identitySlot.$;
    let lastIdx = d.u32(0);

    for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
      if (baseIdx + i < scanLayout.$.input.length) {
        partialSums[i] = operatorSlot.$(prev as number, scanLayout.$.input[baseIdx + i] as number);
        prev = partialSums[i];
        lastIdx = i;
      }
    }
    workgroupMemory.$[localIdx] = partialSums[lastIdx] as number;

    upsweep(localIdx);

    if (localIdx === 0 && workgroupId < scanLayout.$.sums.length) {
      scanLayout.$.sums[workgroupId] = workgroupMemory.$[WORKGROUP_SIZE - 1] as number;
      if (!onlyGreatestElementSlot.$) {
        workgroupMemory.$[WORKGROUP_SIZE - 1] = identitySlot.$;
      }
    }

    if (!onlyGreatestElementSlot.$) {
      downsweep(localIdx);

      std.workgroupBarrier();

      const scannedSum = workgroupMemory.$[localIdx];

      for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
        if (baseIdx + i < scanLayout.$.input.length) {
          if (i === 0) {
            scanLayout.$.input[baseIdx + i] = scannedSum;
          } else {
            scanLayout.$.input[baseIdx + i] = operatorSlot.$(
              scannedSum as number,
              partialSums[i - 1] as number,
            );
          }
        }
      }
    }
  });
}
