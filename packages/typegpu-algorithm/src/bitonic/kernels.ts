import { tgpu, d, std, type TgpuComputeFn } from 'typegpu';
import { dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import { LOCAL_BLOCK, WORKGROUP_SIZE } from './constants.ts';

const LOCAL_BLOCK_LOG2 = Math.log2(LOCAL_BLOCK);

export type BitonicKeyType = d.U32 | d.I32 | d.F32;
type Compare = (a: number, b: number) => boolean;

export const stepUniformsType = /*#__PURE__*/ d.struct({
  k: d.u32,
  jShift: d.u32,
});

export const stepLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  uniforms: { uniform: stepUniformsType },
});

export const validLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  valid: { storage: d.arrayOf(d.u32), access: 'mutable' },
});

export function defaultCompare(a: number, b: number): boolean {
  'use gpu';
  return a < b;
}

export function makeBitonicLayouts(keyType: BitonicKeyType, valueType: d.AnyWgslData | undefined) {
  const payloadType = valueType ?? d.u32;

  return {
    keyType,
    valueType,
    payloadType,
    dataLayout: tgpu.bindGroupLayout({
      data: { storage: d.arrayOf(keyType), access: 'mutable' },
    }),
    valsLayout: tgpu.bindGroupLayout({
      vals: { storage: d.arrayOf(payloadType), access: 'mutable' },
    }),
    copyLayout: tgpu.bindGroupLayout({
      src: { storage: d.arrayOf(keyType), access: 'readonly' },
      dst: { storage: d.arrayOf(keyType), access: 'mutable' },
    }),
    valuesCopyLayout: tgpu.bindGroupLayout({
      srcVals: { storage: d.arrayOf(payloadType), access: 'readonly' },
      dstVals: { storage: d.arrayOf(payloadType), access: 'mutable' },
    }),
  };
}

export type BitonicLayouts = ReturnType<typeof makeBitonicLayouts>;

/**
 * Kernels sorting a power-of-two buffer. With `padded`, a `valid` flag per element marks the
 * padding, which always sorts to the end.
 */
export function makeSortKernels(layouts: BitonicLayouts, compare: Compare, padded: boolean) {
  const { keyType, valueType, payloadType, dataLayout, valsLayout } = layouts;
  const hasPayload = valueType !== undefined;

  function shouldSwap(
    left: number,
    right: number,
    leftValid: number,
    rightValid: number,
    ascending: boolean,
  ) {
    'use gpu';
    if (padded) {
      if (leftValid !== rightValid) {
        return ascending ? leftValid < rightValid : leftValid > rightValid;
      }
      if (leftValid === 0) {
        return false;
      }
    }
    return std.select(compare(left, right), compare(right, left), ascending);
  }

  function swapAt(i: number, j: number, left: number, right: number) {
    'use gpu';
    dataLayout.$.data[i] = right;
    dataLayout.$.data[j] = left;
    if (padded) {
      const tmp = validLayout.$.valid[i] as number;
      validLayout.$.valid[i] = validLayout.$.valid[j] as number;
      validLayout.$.valid[j] = tmp;
    }
    if (hasPayload) {
      const tmp = std.copy(valsLayout.$.vals[i]);
      valsLayout.$.vals[i] = std.copy(valsLayout.$.vals[j]);
      valsLayout.$.vals[j] = std.copy(tmp);
    }
  }

  const globalStep = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const tid = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;

    const k = stepLayout.$.uniforms.k;
    const shift = stepLayout.$.uniforms.jShift;
    const stride = d.u32(1) << shift;

    const below = tid & (stride - 1);
    const above = tid >>> shift;
    const i = below + above * (stride << 1);
    const ixj = i + stride;

    if (ixj >= dataLayout.$.data.length) {
      return;
    }

    const left = dataLayout.$.data[i] as number;
    const right = dataLayout.$.data[ixj] as number;
    const ascending = (i & k) === 0;

    const leftValid = padded ? (validLayout.$.valid[i] as number) : 1;
    const rightValid = padded ? (validLayout.$.valid[ixj] as number) : 1;
    if (shouldSwap(left, right, leftValid, rightValid, ascending)) {
      swapAt(i, ixj, left, right);
    }
  });

  const localKeys = tgpu.workgroupVar(d.arrayOf(keyType, LOCAL_BLOCK));
  const localVals = tgpu.workgroupVar(d.arrayOf(payloadType, LOCAL_BLOCK));
  const localValid = tgpu.workgroupVar(d.arrayOf(d.u32, LOCAL_BLOCK));

  function loadShared(base: number, tid: number) {
    'use gpu';
    localKeys.$[tid] = dataLayout.$.data[base + tid] as number;
    localKeys.$[tid + WORKGROUP_SIZE] = dataLayout.$.data[base + tid + WORKGROUP_SIZE] as number;
    if (padded) {
      localValid.$[tid] = validLayout.$.valid[base + tid] as number;
      localValid.$[tid + WORKGROUP_SIZE] = validLayout.$.valid[
        base + tid + WORKGROUP_SIZE
      ] as number;
    }
    if (hasPayload) {
      localVals.$[tid] = std.copy(valsLayout.$.vals[base + tid]);
      localVals.$[tid + WORKGROUP_SIZE] = std.copy(valsLayout.$.vals[base + tid + WORKGROUP_SIZE]);
    }
  }

  function storeShared(base: number, tid: number) {
    'use gpu';
    dataLayout.$.data[base + tid] = localKeys.$[tid] as number;
    dataLayout.$.data[base + tid + WORKGROUP_SIZE] = localKeys.$[tid + WORKGROUP_SIZE] as number;
    if (padded) {
      validLayout.$.valid[base + tid] = localValid.$[tid] as number;
      validLayout.$.valid[base + tid + WORKGROUP_SIZE] = localValid.$[
        tid + WORKGROUP_SIZE
      ] as number;
    }
    if (hasPayload) {
      valsLayout.$.vals[base + tid] = std.copy(localVals.$[tid]);
      valsLayout.$.vals[base + tid + WORKGROUP_SIZE] = std.copy(localVals.$[tid + WORKGROUP_SIZE]);
    }
  }

  function swapLocalAt(a: number, b: number, left: number, right: number) {
    'use gpu';
    localKeys.$[a] = right;
    localKeys.$[b] = left;
    if (padded) {
      const tmp = localValid.$[a] as number;
      localValid.$[a] = localValid.$[b] as number;
      localValid.$[b] = tmp;
    }
    if (hasPayload) {
      const tmp = std.copy(localVals.$[a]);
      localVals.$[a] = std.copy(localVals.$[b]);
      localVals.$[b] = std.copy(tmp);
    }
  }

  function exchangeLocal(base: number, iLocal: number, stride: number, k: number) {
    'use gpu';
    const jLocal = iLocal + stride;
    const left = localKeys.$[iLocal] as number;
    const right = localKeys.$[jLocal] as number;
    const ascending = ((base + iLocal) & k) === 0;

    const leftValid = padded ? (localValid.$[iLocal] as number) : 1;
    const rightValid = padded ? (localValid.$[jLocal] as number) : 1;
    if (shouldSwap(left, right, leftValid, rightValid, ascending)) {
      swapLocalAt(iLocal, jLocal, left, right);
    }
  }

  function mergeDown(base: number, tid: number, startShift: number, k: number) {
    'use gpu';
    for (let jShift = startShift; jShift > 0; jShift--) {
      std.workgroupBarrier();
      const stride = d.u32(1) << (jShift - 1);
      const below = tid & (stride - 1);
      const above = tid >>> (jShift - 1);
      exchangeLocal(base, below + above * (stride << 1), stride, k);
    }
  }

  const localSort = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const base = flatWorkgroupIndex(wid, numWorkgroups) * LOCAL_BLOCK;
    if (base >= dataLayout.$.data.length) {
      return;
    }

    loadShared(base, lid.x);
    for (let kShift = d.u32(1); kShift <= LOCAL_BLOCK_LOG2; kShift++) {
      mergeDown(base, lid.x, kShift, d.u32(1) << kShift);
    }
    std.workgroupBarrier();
    storeShared(base, lid.x);
  });

  const localMerge = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const base = flatWorkgroupIndex(wid, numWorkgroups) * LOCAL_BLOCK;
    if (base >= dataLayout.$.data.length) {
      return;
    }

    loadShared(base, lid.x);
    mergeDown(base, lid.x, d.u32(LOCAL_BLOCK_LOG2), stepLayout.$.uniforms.k);
    std.workgroupBarrier();
    storeShared(base, lid.x);
  });

  const localStorageSize =
    d.sizeOf(d.arrayOf(keyType, LOCAL_BLOCK)) +
    (valueType ? d.sizeOf(d.arrayOf(valueType, LOCAL_BLOCK)) : 0) +
    (padded ? LOCAL_BLOCK * d.sizeOf(d.u32) : 0);

  return { globalStep, localSort, localMerge, localStorageSize };
}

/**
 * Copies the keys (and values) into the padded work buffers, marking the padding as invalid,
 * and back out after sorting. Sizes come from the bound buffers.
 */
export function makePaddingKernels(layouts: BitonicLayouts): {
  pad: TgpuComputeFn;
  unpad: TgpuComputeFn;
} {
  const { copyLayout, valuesCopyLayout, valueType } = layouts;
  const hasPayload = valueType !== undefined;

  function copyAt(idx: number) {
    'use gpu';
    copyLayout.$.dst[idx] = copyLayout.$.src[idx] as number;
    if (hasPayload) {
      valuesCopyLayout.$.dstVals[idx] = std.copy(valuesCopyLayout.$.srcVals[idx]);
    }
  }

  const pad = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const idx = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    const size = copyLayout.$.src.length;
    if (idx < size) {
      copyAt(idx);
    }
    if (idx < validLayout.$.valid.length) {
      validLayout.$.valid[idx] = d.u32(idx < size);
    }
  });

  const unpad = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const idx = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    if (idx < copyLayout.$.dst.length) {
      copyAt(idx);
    }
  });

  return { pad, unpad };
}
