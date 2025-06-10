import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { WORKGROUP_SIZE } from './params.ts';
import { computeLayout } from './types.ts';
import { getIndex } from './computeShared.ts';

export const computeSimple = tgpu['~unstable'].computeFn({
  workgroupSize: WORKGROUP_SIZE,
  in: {
    gid: d.builtin.globalInvocationId,
  },
})((input) => {
  const row = input.gid.x;
  const col = input.gid.y;

  if (
    row >= computeLayout.$.dimensions.firstRowCount ||
    col >= computeLayout.$.dimensions.secondColumnCount
  ) {
    return;
  }

  let result = 0;

  for (let k = d.u32(0); k < computeLayout.$.dimensions.firstColumnCount; k++) {
    const aValue = computeLayout.$.firstMatrix[
      getIndex(row, k, computeLayout.$.dimensions.firstColumnCount)
    ];
    const bValue = computeLayout.$.secondMatrix[
      getIndex(k, col, computeLayout.$.dimensions.secondColumnCount)
    ];
    result += aValue * bValue;
  }

  computeLayout.$.resultMatrix[
    getIndex(row, col, computeLayout.$.dimensions.secondColumnCount)
  ] = result;
});
