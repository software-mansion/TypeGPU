import {
  tgpu,
  d,
  std,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuComputeFn,
  type TgpuComputePipeline,
  type TgpuRoot,
  type TgpuMutable,
} from 'typegpu';
import { decomposeWorkgroups, dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import { type DispatchStep, stepRunner } from '../runPass.ts';
import type { BitonicSorter, BitonicSorterOptions } from './types.ts';

const WORKGROUP_SIZE = 256;
const LOCAL_BLOCK = WORKGROUP_SIZE * 2;
const LOCAL_BLOCK_LOG2 = Math.log2(LOCAL_BLOCK);

export type BitonicKeyType = d.U32 | d.I32 | d.F32;

type KeyBuffer = TgpuBuffer<d.WgslArray<BitonicKeyType>> & StorageFlag;
type ValueBuffer = TgpuBuffer<d.WgslArray<d.AnyWgslData>> & StorageFlag;
type Compare = (a: number, b: number) => boolean;

const stepUniformsType = d.struct({
  k: d.u32,
  jShift: d.u32,
});

const stepLayout = tgpu.bindGroupLayout({
  uniforms: { uniform: stepUniformsType },
});

export function defaultCompare(a: number, b: number): boolean {
  'use gpu';
  return a < b;
}

function nextPowerOf2(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return 1 << (32 - Math.clz32(n - 1));
}

function makeBitonicSchemas(
  keyType: BitonicKeyType,
  valueType: d.AnyWgslData | undefined,
  compare: Compare,
  valid: TgpuMutable<d.WgslArray<d.U32>> | undefined,
) {
  const dataLayout = tgpu.bindGroupLayout({
    data: { storage: d.arrayOf(keyType), access: 'mutable' },
  });

  const hasPayload = valueType !== undefined;
  const payloadType = valueType ?? d.u32;

  const valsLayout = tgpu.bindGroupLayout({
    vals: { storage: d.arrayOf(payloadType), access: 'mutable' },
  });

  function shouldSwap(
    left: number,
    right: number,
    leftValid: number,
    rightValid: number,
    ascending: boolean,
  ) {
    'use gpu';
    if (valid !== undefined) {
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
    if (valid !== undefined) {
      const tmp = valid.$[i] as number;
      valid.$[i] = valid.$[j] as number;
      valid.$[j] = tmp;
    }
    if (hasPayload) {
      const tmp = std.copy(valsLayout.$.vals[i]);
      valsLayout.$.vals[i] = std.copy(valsLayout.$.vals[j]);
      valsLayout.$.vals[j] = std.copy(tmp);
    }
  }

  return {
    keyType,
    valueType,
    hasPayload,
    payloadType,
    dataLayout,
    valsLayout,
    valid,
    shouldSwap,
    swapAt,
  };
}

type BitonicSchemas = ReturnType<typeof makeBitonicSchemas>;

function makePaddingKernels(schemas: BitonicSchemas, size: number, paddedSize: number) {
  const { keyType, hasPayload, payloadType, valid } = schemas;

  const copyLayout = tgpu.bindGroupLayout({
    src: { storage: d.arrayOf(keyType), access: 'readonly' },
    dst: { storage: d.arrayOf(keyType), access: 'mutable' },
  });

  const valuesCopyLayout = tgpu.bindGroupLayout({
    srcVals: { storage: d.arrayOf(payloadType), access: 'readonly' },
    dstVals: { storage: d.arrayOf(payloadType), access: 'mutable' },
  });

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
    if (idx < size) {
      copyAt(idx);
    }
    if (valid !== undefined && idx < paddedSize) {
      valid.$[idx] = d.u32(idx < size);
    }
  });

  const unpad = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const idx = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    if (idx < size) {
      copyAt(idx);
    }
  });

  return { copyLayout, valuesCopyLayout, pad, unpad };
}

function makeGlobalStepKernel(schemas: BitonicSchemas) {
  const { dataLayout, valid, shouldSwap, swapAt } = schemas;

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
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

      const leftValid = valid !== undefined ? (valid.$[i] as number) : 1;
      const rightValid = valid !== undefined ? (valid.$[ixj] as number) : 1;
      if (shouldSwap(left, right, leftValid, rightValid, ascending)) {
        swapAt(i, ixj, left, right);
      }
    },
  );
}

function makeLocalKernels(schemas: BitonicSchemas) {
  const { keyType, hasPayload, payloadType, dataLayout, valsLayout, valid, shouldSwap } = schemas;

  const localKeys = tgpu.workgroupVar(d.arrayOf(keyType, LOCAL_BLOCK));
  const localVals = tgpu.workgroupVar(d.arrayOf(payloadType, LOCAL_BLOCK));
  const localValid = tgpu.workgroupVar(d.arrayOf(d.u32, LOCAL_BLOCK));

  function loadShared(base: number, tid: number) {
    'use gpu';
    localKeys.$[tid] = dataLayout.$.data[base + tid] as number;
    localKeys.$[tid + WORKGROUP_SIZE] = dataLayout.$.data[base + tid + WORKGROUP_SIZE] as number;
    if (valid !== undefined) {
      localValid.$[tid] = valid.$[base + tid] as number;
      localValid.$[tid + WORKGROUP_SIZE] = valid.$[base + tid + WORKGROUP_SIZE] as number;
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
    if (valid !== undefined) {
      valid.$[base + tid] = localValid.$[tid] as number;
      valid.$[base + tid + WORKGROUP_SIZE] = localValid.$[tid + WORKGROUP_SIZE] as number;
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
    if (valid !== undefined) {
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

    const leftValid = valid !== undefined ? (localValid.$[iLocal] as number) : 1;
    const rightValid = valid !== undefined ? (localValid.$[jLocal] as number) : 1;
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

  return { localSort, localMerge };
}

/**
 * Creates a bitonic sorter for a `u32`, `i32` or `f32` key buffer, optionally reordering
 * a payload buffer alongside the keys. The order is defined by an arbitrary comparator.
 * All GPU resources are created up front, so `run` only records dispatches.
 */
export function createBitonicSorter<
  TKey extends BitonicKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
>(
  root: TgpuRoot,
  data: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag,
  options?: BitonicSorterOptions<TValue>,
): BitonicSorter {
  const keyBuffer = data as KeyBuffer;
  const valueBuffer = options?.values as ValueBuffer | undefined;

  const keyType = keyBuffer.dataType.elementType;
  const size = keyBuffer.dataType.elementCount;
  const paddedSize = nextPowerOf2(size);

  if (size === 0) {
    throw new Error('Cannot create a bitonic sorter for an empty buffer.');
  }
  if (valueBuffer && valueBuffer.dataType.elementCount !== size) {
    throw new Error(
      `The values buffer (${valueBuffer.dataType.elementCount} elements) must match the key buffer (${size} elements).`,
    );
  }

  // Padding must stay distinguishable from real keys that compare equal
  const valid = paddedSize !== size ? root.createMutable(d.arrayOf(d.u32, paddedSize)) : undefined;
  const schemas = makeBitonicSchemas(
    keyType,
    valueBuffer?.dataType.elementType,
    options?.compare ?? defaultCompare,
    valid,
  );
  const owned: { destroy(): void }[] = valid ? [valid.buffer] : [];
  const steps: DispatchStep[] = [];

  let workKeys = keyBuffer;
  let workValues = valueBuffer;
  let unpadStep: DispatchStep | undefined;

  if (paddedSize !== size) {
    const { copyLayout, valuesCopyLayout, pad, unpad } = makePaddingKernels(
      schemas,
      size,
      paddedSize,
    );
    workKeys = root.createBuffer(d.arrayOf(keyType, paddedSize)).$usage('storage') as KeyBuffer;
    owned.push(workKeys);

    let padPipeline = root
      .createComputePipeline({ compute: pad })
      .with(root.createBindGroup(copyLayout, { src: keyBuffer, dst: workKeys }));
    let unpadPipeline = root
      .createComputePipeline({ compute: unpad })
      .with(root.createBindGroup(copyLayout, { src: workKeys, dst: keyBuffer }));

    if (valueBuffer) {
      workValues = root
        .createBuffer(d.arrayOf(valueBuffer.dataType.elementType, paddedSize))
        .$usage('storage') as ValueBuffer;
      owned.push(workValues);
      padPipeline = padPipeline.with(
        root.createBindGroup(valuesCopyLayout, { srcVals: valueBuffer, dstVals: workValues }),
      );
      unpadPipeline = unpadPipeline.with(
        root.createBindGroup(valuesCopyLayout, { srcVals: workValues, dstVals: valueBuffer }),
      );
    }

    steps.push({
      pipeline: padPipeline,
      workgroups: decomposeWorkgroups(Math.ceil(paddedSize / WORKGROUP_SIZE)),
    });
    unpadStep = {
      pipeline: unpadPipeline,
      workgroups: decomposeWorkgroups(Math.ceil(size / WORKGROUP_SIZE)),
    };
  }

  const dataBindGroup = root.createBindGroup(schemas.dataLayout, { data: workKeys });
  const valsBindGroup = workValues
    ? root.createBindGroup(schemas.valsLayout, { vals: workValues })
    : undefined;

  function createSortPipeline(compute: TgpuComputeFn): TgpuComputePipeline {
    const pipeline = root.createComputePipeline({ compute }).with(dataBindGroup);
    return valsBindGroup ? pipeline.with(valsBindGroup) : pipeline;
  }

  function pushStep(
    pipeline: TgpuComputePipeline,
    k: number,
    jShift: number,
    workgroups: [number, number, number],
  ): void {
    const uniforms = root.createBuffer(stepUniformsType, { k, jShift }).$usage('uniform');
    owned.push(uniforms);

    steps.push({
      pipeline: pipeline.with(root.createBindGroup(stepLayout, { uniforms })),
      workgroups,
    });
  }

  const sharedMemoryBytes =
    d.sizeOf(d.arrayOf(keyType, LOCAL_BLOCK)) +
    (schemas.valueType ? d.sizeOf(d.arrayOf(schemas.valueType, LOCAL_BLOCK)) : 0) +
    (valid ? LOCAL_BLOCK * d.sizeOf(d.u32) : 0);
  const useLocalKernels =
    paddedSize >= LOCAL_BLOCK &&
    sharedMemoryBytes <= root.device.limits.maxComputeWorkgroupStorageSize;

  const globalWorkgroups = decomposeWorkgroups(Math.ceil(paddedSize / 2 / WORKGROUP_SIZE));
  const globalPipeline = createSortPipeline(makeGlobalStepKernel(schemas));

  if (useLocalKernels) {
    const { localSort, localMerge } = makeLocalKernels(schemas);
    const localMergePipeline = createSortPipeline(localMerge);
    const blockWorkgroups = decomposeWorkgroups(paddedSize / LOCAL_BLOCK);

    steps.push({ pipeline: createSortPipeline(localSort), workgroups: blockWorkgroups });
    for (let k = LOCAL_BLOCK * 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j >= LOCAL_BLOCK; j >>= 1) {
        pushStep(globalPipeline, k, Math.log2(j), globalWorkgroups);
      }
      pushStep(localMergePipeline, k, 0, blockWorkgroups);
    }
  } else {
    for (let k = 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j > 0; j >>= 1) {
        pushStep(globalPipeline, k, Math.log2(j), globalWorkgroups);
      }
    }
  }

  if (unpadStep) {
    steps.push(unpadStep);
  }

  return {
    size,
    paddedSize,
    ...stepRunner(root.device, steps),

    destroy(): void {
      for (const buffer of owned) {
        buffer.destroy();
      }
    },
  };
}
