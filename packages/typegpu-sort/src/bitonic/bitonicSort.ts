import {
  tgpu,
  d,
  std,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuComputeFn,
  type TgpuComputePipeline,
  type TgpuRoot,
} from 'typegpu';
import { decomposeWorkgroups, dispatchIn, flatWorkgroupIndex } from '../dispatch.ts';
import { beginRunPass, bindPass } from '../runPass.ts';
import type { RunOptions } from '../types.ts';
import { compareSlot, defaultCompare, defaultPaddingValues } from './slots.ts';
import type { BitonicSorter, BitonicSorterOptions } from './types.ts';

const WORKGROUP_SIZE = 256;
const LOCAL_BLOCK = WORKGROUP_SIZE * 2;
const LOCAL_BLOCK_LOG2 = Math.log2(LOCAL_BLOCK);

export type BitonicKeyType = d.U32 | d.I32 | d.F32;

type KeyBuffer = TgpuBuffer<d.WgslArray<BitonicKeyType>> & StorageFlag;
type ValueBuffer = TgpuBuffer<d.WgslArray<d.AnyWgslData>> & StorageFlag;

const sortUniformsType = d.struct({
  k: d.u32,
  jShift: d.u32,
});

function nextPowerOf2(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return 1 << (32 - Math.clz32(n - 1));
}

function makeBitonicSchemas(keyType: BitonicKeyType, valueType: d.AnyWgslData | undefined) {
  const sortLayout = tgpu.bindGroupLayout({
    data: { storage: d.arrayOf(keyType), access: 'mutable' },
    uniforms: { uniform: sortUniformsType },
  });

  const hasPayload = valueType !== undefined;
  const payloadType = valueType ?? d.u32;

  const valsLayout = tgpu.bindGroupLayout({
    vals: { storage: d.arrayOf(payloadType), access: 'mutable' },
  });

  function swapAt(i: number, j: number, left: number, right: number) {
    'use gpu';
    sortLayout.$.data[i] = right;
    sortLayout.$.data[j] = left;
    if (hasPayload) {
      const tmp = std.copy(valsLayout.$.vals[i] as number);
      (valsLayout.$.vals[i] as number) = std.copy(valsLayout.$.vals[j] as number);
      (valsLayout.$.vals[j] as number) = std.copy(tmp);
    }
  }

  return { keyType, valueType, hasPayload, payloadType, sortLayout, valsLayout, swapAt };
}

type BitonicSchemas = ReturnType<typeof makeBitonicSchemas>;

function makePaddingKernels(keyType: BitonicKeyType, size: number, paddedSize: number) {
  const copyLayout = tgpu.bindGroupLayout({
    src: { storage: d.arrayOf(keyType), access: 'readonly' },
    dst: { storage: d.arrayOf(keyType), access: 'mutable' },
    padding: { uniform: keyType },
  });

  const pad = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const idx = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    if (idx >= paddedSize) {
      return;
    }

    if (idx < size) {
      copyLayout.$.dst[idx] = copyLayout.$.src[idx] as number;
    } else {
      copyLayout.$.dst[idx] = copyLayout.$.padding;
    }
  });

  const unpad = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const idx = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;
    if (idx < size) {
      (copyLayout.$.dst[idx] as number) = copyLayout.$.src[idx] as number;
    }
  });

  return { copyLayout, pad, unpad };
}

function makeGlobalStepKernel(schemas: BitonicSchemas) {
  const { sortLayout, swapAt } = schemas;

  return tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(
    ({ lid, wid, numWorkgroups }) => {
      const tid = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;

      const k = sortLayout.$.uniforms.k;
      const shift = sortLayout.$.uniforms.jShift;
      const stride = d.u32(1) << shift;

      const below = tid & (stride - 1);
      const above = tid >> shift;
      const i = below + above * (stride << 1);
      const ixj = i + stride;

      if (ixj >= d.u32(sortLayout.$.data.length)) {
        return;
      }

      const left = sortLayout.$.data[i] as number;
      const right = sortLayout.$.data[ixj] as number;
      const ascending = (i & k) === 0;

      if (std.select(compareSlot.$(left, right), compareSlot.$(right, left), ascending)) {
        swapAt(i, ixj, left, right);
      }
    },
  );
}

function makeLocalKernels(schemas: BitonicSchemas) {
  const { keyType, hasPayload, payloadType, sortLayout, valsLayout } = schemas;

  const localKeys = tgpu.workgroupVar(d.arrayOf(keyType, LOCAL_BLOCK));
  const localVals = tgpu.workgroupVar(d.arrayOf(payloadType, LOCAL_BLOCK));

  function loadShared(base: number, tid: number) {
    'use gpu';
    (localKeys.$[tid] as number) = sortLayout.$.data[base + tid] as number;
    (localKeys.$[tid + WORKGROUP_SIZE] as number) = sortLayout.$.data[
      base + tid + WORKGROUP_SIZE
    ] as number;
    if (hasPayload) {
      (localVals.$[tid] as number) = std.copy(valsLayout.$.vals[base + tid] as number);
      (localVals.$[tid + WORKGROUP_SIZE] as number) = std.copy(
        valsLayout.$.vals[base + tid + WORKGROUP_SIZE] as number,
      );
    }
  }

  function storeShared(base: number, tid: number) {
    'use gpu';
    (sortLayout.$.data[base + tid] as number) = localKeys.$[tid] as number;
    (sortLayout.$.data[base + tid + WORKGROUP_SIZE] as number) = localKeys.$[
      tid + WORKGROUP_SIZE
    ] as number;
    if (hasPayload) {
      (valsLayout.$.vals[base + tid] as number) = std.copy(localVals.$[tid] as number);
      (valsLayout.$.vals[base + tid + WORKGROUP_SIZE] as number) = std.copy(
        localVals.$[tid + WORKGROUP_SIZE] as number,
      );
    }
  }

  function swapLocalAt(a: number, b: number, left: number, right: number) {
    'use gpu';
    localKeys.$[a] = right;
    localKeys.$[b] = left;
    if (hasPayload) {
      const tmp = std.copy(localVals.$[a] as number);
      (localVals.$[a] as number) = std.copy(localVals.$[b] as number);
      (localVals.$[b] as number) = std.copy(tmp);
    }
  }

  function exchangeLocal(base: number, iLocal: number, stride: number, k: number) {
    'use gpu';
    const jLocal = iLocal + stride;
    const left = localKeys.$[iLocal] as number;
    const right = localKeys.$[jLocal] as number;
    const ascending = ((base + iLocal) & k) === 0;

    if (std.select(compareSlot.$(left, right), compareSlot.$(right, left), ascending)) {
      swapLocalAt(iLocal, jLocal, left, right);
    }
  }

  function mergeDown(base: number, tid: number, startShift: number, k: number) {
    'use gpu';
    for (let jShift = d.u32(startShift); jShift > 0; jShift--) {
      std.workgroupBarrier();
      const stride = d.u32(1) << (jShift - 1);
      const below = tid & (stride - 1);
      const above = tid >> (jShift - 1);
      exchangeLocal(base, below + above * (stride << 1), stride, k);
    }
  }

  const localSort = tgpu.computeFn({ workgroupSize: [WORKGROUP_SIZE], in: dispatchIn })(({
    lid,
    wid,
    numWorkgroups,
  }) => {
    const base = flatWorkgroupIndex(wid, numWorkgroups) * LOCAL_BLOCK;
    if (base >= sortLayout.$.data.length) {
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
    if (base >= sortLayout.$.data.length) {
      return;
    }

    loadShared(base, lid.x);
    mergeDown(base, lid.x, d.u32(LOCAL_BLOCK_LOG2), sortLayout.$.uniforms.k);
    std.workgroupBarrier();
    storeShared(base, lid.x);
  });

  return { localSort, localMerge };
}

interface SortStep {
  pipeline: TgpuComputePipeline;
  workgroups: [number, number, number];
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
  if (valueBuffer && paddedSize !== size) {
    throw new Error('Bitonic sorting with a values buffer requires a power-of-two element count.');
  }

  const schemas = makeBitonicSchemas(keyType, valueBuffer?.dataType.elementType);
  const owned: { destroy(): void }[] = [];
  const steps: SortStep[] = [];

  let workBuffer = keyBuffer;
  let unpadStep: SortStep | undefined;

  if (paddedSize !== size) {
    const { copyLayout, pad, unpad } = makePaddingKernels(keyType, size, paddedSize);
    const padding = root
      .createBuffer(keyType, options?.paddingValue ?? defaultPaddingValues[keyType.type])
      .$usage('uniform');
    workBuffer = root.createBuffer(d.arrayOf(keyType, paddedSize)).$usage('storage') as KeyBuffer;
    owned.push(padding, workBuffer);

    steps.push({
      pipeline: root
        .createComputePipeline({ compute: pad })
        .with(root.createBindGroup(copyLayout, { src: keyBuffer, dst: workBuffer, padding })),
      workgroups: decomposeWorkgroups(Math.ceil(paddedSize / WORKGROUP_SIZE)),
    });
    unpadStep = {
      pipeline: root
        .createComputePipeline({ compute: unpad })
        .with(root.createBindGroup(copyLayout, { src: workBuffer, dst: keyBuffer, padding })),
      workgroups: decomposeWorkgroups(Math.ceil(size / WORKGROUP_SIZE)),
    };
  }

  const valsBindGroup = valueBuffer
    ? root.createBindGroup(schemas.valsLayout, { vals: valueBuffer })
    : undefined;

  const compare = options?.compare ?? defaultCompare;

  function createSortPipeline(compute: TgpuComputeFn): TgpuComputePipeline {
    const pipeline = root.with(compareSlot, compare).createComputePipeline({ compute });
    return valsBindGroup ? pipeline.with(valsBindGroup) : pipeline;
  }

  function pushStep(
    pipeline: TgpuComputePipeline,
    k: number,
    jShift: number,
    workgroups: [number, number, number],
  ): void {
    const uniforms = root.createBuffer(sortUniformsType, { k, jShift }).$usage('uniform');
    owned.push(uniforms);

    steps.push({
      pipeline: pipeline.with(
        root.createBindGroup(schemas.sortLayout, { data: workBuffer, uniforms }),
      ),
      workgroups,
    });
  }

  const payloadSize = schemas.valueType ? d.sizeOf(schemas.valueType) : 0;
  const sharedMemoryBytes = LOCAL_BLOCK * (d.sizeOf(keyType) + payloadSize);
  const useLocalKernels =
    paddedSize >= LOCAL_BLOCK &&
    sharedMemoryBytes <= root.device.limits.maxComputeWorkgroupStorageSize;

  const globalWorkgroups = decomposeWorkgroups(Math.ceil(paddedSize / 2 / WORKGROUP_SIZE));
  const globalPipeline = createSortPipeline(makeGlobalStepKernel(schemas));

  if (useLocalKernels) {
    const { localSort, localMerge } = makeLocalKernels(schemas);
    const localSortPipeline = createSortPipeline(localSort);
    const localMergePipeline = createSortPipeline(localMerge);
    const blockWorkgroups = decomposeWorkgroups(paddedSize / LOCAL_BLOCK);

    pushStep(localSortPipeline, 0, 0, blockWorkgroups);
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

    run(runOptions?: RunOptions): void {
      const recording = beginRunPass(root.device, runOptions);
      for (const step of steps) {
        bindPass(step.pipeline, recording.pass).dispatchWorkgroups(...step.workgroups);
      }
      recording.finish();
    },

    destroy(): void {
      for (const buffer of owned) {
        buffer.destroy();
      }
    },
  };
}
