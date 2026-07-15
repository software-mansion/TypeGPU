import { tgpu, d, std } from 'typegpu';
import { flatWorkgroupIndex } from '../../wgslUtils.ts';
import { ELEMENTS_PER_THREAD, type ScanSchemas, WORKGROUP_SIZE } from '../schemas.ts';

export function makeUniformOp(schemas: ScanSchemas) {
  const { operatorSlot, uniformOpLayout } = schemas;

  return tgpu.computeFn({
    workgroupSize: [WORKGROUP_SIZE],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
    },
  })(({ lid, wid, numWorkgroups }) => {
    const workgroupId = flatWorkgroupIndex(wid, numWorkgroups);
    const baseIdx = (workgroupId * WORKGROUP_SIZE + lid.x) * ELEMENTS_PER_THREAD;
    const opValue = uniformOpLayout.$.sums[workgroupId];

    for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
      if (baseIdx + i < uniformOpLayout.$.input.length) {
        (uniformOpLayout.$.input[baseIdx + i] as number) = operatorSlot.$(
          opValue as number,
          uniformOpLayout.$.input[baseIdx + i] as number,
        );
      }
    }
  });
}
