import {
  tgpu,
  d,
  std,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuComputePipeline,
  type TgpuRoot,
  type UniformFlag,
} from 'typegpu';
import { beginRunPass } from '../runPass.ts';
import { flatWorkgroupIndex } from '../wgslUtils.ts';
import { compareSlot, defaultCompares, defaultPaddingValues } from './slots.ts';
import type { BitonicSorter, BitonicSorterOptions, BitonicSorterRunOptions } from './types.ts';
import { decomposeWorkgroups, nextPowerOf2 } from './utils.ts';

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

function makeBitonicSchemas(keyType: BitonicKeyType, valueType?: d.AnyWgslData) {
  const copyParamsType = d.struct({
    srcLength: d.u32,
    dstLength: d.u32,
    paddingValue: keyType,
  });

  const sortLayout = tgpu.bindGroupLayout({
    data: { storage: d.arrayOf(keyType), access: 'mutable' },
    uniforms: { uniform: sortUniformsType },
  });

  const copyLayout = tgpu.bindGroupLayout({
    src: { storage: d.arrayOf(keyType), access: 'readonly' },
    dst: { storage: d.arrayOf(keyType), access: 'mutable' },
    params: { uniform: copyParamsType },
  });

  const valsLayout = valueType
    ? tgpu.bindGroupLayout({
        vals: { storage: d.arrayOf(valueType), access: 'mutable' },
      })
    : undefined;

  const valsCopyLayout = valueType
    ? tgpu.bindGroupLayout({
        src: { storage: d.arrayOf(valueType), access: 'readonly' },
        dst: { storage: d.arrayOf(valueType), access: 'mutable' },
        params: { uniform: copyParamsType },
      })
    : undefined;

  const copyValue = valueType as unknown as (value: unknown) => number;

  const swapValues =
    valsLayout && valueType
      ? tgpu.fn([d.u32, d.u32])((i, j) => {
          const tmp = copyValue(valsLayout.$.vals[i]);
          (valsLayout.$.vals[i] as number) = copyValue(valsLayout.$.vals[j]);
          (valsLayout.$.vals[j] as number) = tmp;
        })
      : tgpu.fn([d.u32, d.u32])(() => {});

  return {
    keyType,
    copyParamsType,
    sortLayout,
    copyLayout,
    valsLayout,
    valsCopyLayout,
    swapValues,
  };
}

type BitonicSchemas = ReturnType<typeof makeBitonicSchemas>;

function makeKernels(schemas: BitonicSchemas) {
  const { sortLayout, copyLayout, valsCopyLayout, swapValues } = schemas;

  const copyPadKernel = tgpu.computeFn({
    workgroupSize: [WORKGROUP_SIZE],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
    },
  })(({ lid, wid, numWorkgroups }) => {
    const idx = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;

    if (idx >= copyLayout.$.params.dstLength) {
      return;
    }

    copyLayout.$.dst[idx] = std.select(
      copyLayout.$.params.paddingValue as number,
      copyLayout.$.src[idx] as number,
      idx < copyLayout.$.params.srcLength,
    );
  });

  function makeCopyBackKernel(
    layout: BitonicSchemas['copyLayout'] | NonNullable<BitonicSchemas['valsCopyLayout']>,
  ) {
    const copyBack = tgpu.computeFn({
      workgroupSize: [WORKGROUP_SIZE],
      in: {
        lid: d.builtin.localInvocationId,
        wid: d.builtin.workgroupId,
        numWorkgroups: d.builtin.numWorkgroups,
      },
    })(({ lid, wid, numWorkgroups }) => {
      const idx = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;

      if (idx < layout.$.params.srcLength) {
        (layout.$.dst[idx] as number) = layout.$.src[idx] as number;
      }
    });
    return copyBack;
  }

  const copyBackKernel = makeCopyBackKernel(copyLayout);
  const valsCopyKernel = valsCopyLayout ? makeCopyBackKernel(valsCopyLayout) : undefined;

  const bitonicStepKernel = tgpu.computeFn({
    workgroupSize: [WORKGROUP_SIZE],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
    },
  })(({ lid, wid, numWorkgroups }) => {
    const tid = flatWorkgroupIndex(wid, numWorkgroups) * WORKGROUP_SIZE + lid.x;

    const k = sortLayout.$.uniforms.k;
    const shift = sortLayout.$.uniforms.jShift;
    const dataLength = d.u32(sortLayout.$.data.length);
    const stride = d.u32(1) << shift;

    const maskBelow = stride - 1;
    const below = tid & maskBelow;
    const above = tid >>> shift;

    const i = below + above * (stride << 1);
    const ixj = i + stride;

    if (ixj >= dataLength) {
      return;
    }

    const ascending = (i & k) === 0;
    const left = sortLayout.$.data[i] as number;
    const right = sortLayout.$.data[ixj] as number;

    const leftFirst = compareSlot.$(left, right);
    const shouldSwap = std.select(leftFirst, !leftFirst, ascending);

    if (shouldSwap) {
      sortLayout.$.data[i] = right;
      sortLayout.$.data[ixj] = left;
      swapValues(i, ixj);
    }
  });

  return { copyPadKernel, copyBackKernel, valsCopyKernel, bitonicStepKernel };
}

/**
 * Shared-memory kernels that run many compare-exchange substeps in one dispatch.
 * Each workgroup loads a LOCAL_BLOCK-sized slice of the data into workgroup
 * memory and performs every substep with stride < LOCAL_BLOCK there — those pairs
 * never cross the block boundary. `localSortKernel` covers all phases with
 * k <= LOCAL_BLOCK (a full bitonic sort of each block); `localMergeKernel`
 * finishes a k-phase (k read from the uniforms) once the stride drops below the
 * block size. Only used when the padded size is a multiple of LOCAL_BLOCK, so
 * per-element bounds checks are not needed. The 3D dispatch grid may contain
 * more workgroups than blocks, and whole workgroups past the last block exit
 * early.
 */
function makeLocalKernels(schemas: BitonicSchemas, valueType?: d.AnyWgslData) {
  const { keyType, sortLayout, valsLayout } = schemas;
  const copyValue = valueType as unknown as (value: unknown) => number;

  const localKeys = tgpu.workgroupVar(d.arrayOf(keyType, LOCAL_BLOCK));
  const localVals =
    valueType && valsLayout ? tgpu.workgroupVar(d.arrayOf(valueType, LOCAL_BLOCK)) : undefined;

  const loadShared =
    localVals && valsLayout
      ? tgpu.fn([d.u32, d.u32])((base, tid) => {
          (localKeys.$[tid] as number) = sortLayout.$.data[base + tid] as number;
          (localKeys.$[tid + WORKGROUP_SIZE] as number) = sortLayout.$.data[
            base + tid + WORKGROUP_SIZE
          ] as number;
          (localVals.$[tid] as number) = copyValue(valsLayout.$.vals[base + tid]);
          (localVals.$[tid + WORKGROUP_SIZE] as number) = copyValue(
            valsLayout.$.vals[base + tid + WORKGROUP_SIZE],
          );
        })
      : tgpu.fn([d.u32, d.u32])((base, tid) => {
          (localKeys.$[tid] as number) = sortLayout.$.data[base + tid] as number;
          (localKeys.$[tid + WORKGROUP_SIZE] as number) = sortLayout.$.data[
            base + tid + WORKGROUP_SIZE
          ] as number;
        });

  const storeShared =
    localVals && valsLayout
      ? tgpu.fn([d.u32, d.u32])((base, tid) => {
          (sortLayout.$.data[base + tid] as number) = localKeys.$[tid] as number;
          (sortLayout.$.data[base + tid + WORKGROUP_SIZE] as number) = localKeys.$[
            tid + WORKGROUP_SIZE
          ] as number;
          (valsLayout.$.vals[base + tid] as number) = copyValue(localVals.$[tid]);
          (valsLayout.$.vals[base + tid + WORKGROUP_SIZE] as number) = copyValue(
            localVals.$[tid + WORKGROUP_SIZE],
          );
        })
      : tgpu.fn([d.u32, d.u32])((base, tid) => {
          (sortLayout.$.data[base + tid] as number) = localKeys.$[tid] as number;
          (sortLayout.$.data[base + tid + WORKGROUP_SIZE] as number) = localKeys.$[
            tid + WORKGROUP_SIZE
          ] as number;
        });

  const swapLocalValues = localVals
    ? tgpu.fn([d.u32, d.u32])((a, b) => {
        const tmp = copyValue(localVals.$[a]);
        (localVals.$[a] as number) = copyValue(localVals.$[b]);
        (localVals.$[b] as number) = tmp;
      })
    : tgpu.fn([d.u32, d.u32])(() => {});

  const exchangeLocal = tgpu.fn([d.u32, d.u32, d.u32, d.u32])((base, iLocal, stride, k) => {
    const ixjLocal = iLocal + stride;
    const left = localKeys.$[iLocal] as number;
    const right = localKeys.$[ixjLocal] as number;
    const ascending = ((base + iLocal) & k) === 0;
    const leftFirst = compareSlot.$(left, right);
    const shouldSwap = std.select(leftFirst, !leftFirst, ascending);
    if (shouldSwap) {
      localKeys.$[iLocal] = right;
      localKeys.$[ixjLocal] = left;
      swapLocalValues(iLocal, ixjLocal);
    }
  });

  const mergeDown = tgpu.fn([d.u32, d.u32, d.u32, d.u32])((base, tid, startShift, k) => {
    for (let jShift = d.u32(startShift); jShift > 0; jShift--) {
      std.workgroupBarrier();
      const stride = d.u32(1) << (jShift - 1);
      const below = tid & (stride - 1);
      const above = tid >> (jShift - 1);
      const iLocal = below + above * (stride << 1);
      exchangeLocal(base, iLocal, stride, k);
    }
  });

  const localSortKernel = tgpu.computeFn({
    workgroupSize: [WORKGROUP_SIZE],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
    },
  })(({ lid, wid, numWorkgroups }) => {
    const tid = lid.x;
    const base = flatWorkgroupIndex(wid, numWorkgroups) * LOCAL_BLOCK;
    if (base >= sortLayout.$.data.length) {
      return;
    }

    loadShared(base, tid);

    for (let kShift = d.u32(1); kShift <= LOCAL_BLOCK_LOG2; kShift++) {
      mergeDown(base, tid, kShift, d.u32(1) << kShift);
    }

    std.workgroupBarrier();
    storeShared(base, tid);
  });

  const localMergeKernel = tgpu.computeFn({
    workgroupSize: [WORKGROUP_SIZE],
    in: {
      lid: d.builtin.localInvocationId,
      wid: d.builtin.workgroupId,
      numWorkgroups: d.builtin.numWorkgroups,
    },
  })(({ lid, wid, numWorkgroups }) => {
    const tid = lid.x;
    const base = flatWorkgroupIndex(wid, numWorkgroups) * LOCAL_BLOCK;
    if (base >= sortLayout.$.data.length) {
      return;
    }

    loadShared(base, tid);
    mergeDown(base, tid, LOCAL_BLOCK_LOG2, sortLayout.$.uniforms.k);
    std.workgroupBarrier();
    storeShared(base, tid);
  });

  return { localSortKernel, localMergeKernel };
}

interface SortStep {
  pipeline: TgpuComputePipeline;
  workgroups: [number, number, number];
}

/**
 * Create a bitonic sorter for the given key buffer (u32, i32 or f32 elements),
 * optionally reordering a payload buffer alongside the keys. The order is defined
 * by the comparator (any comparison function works — this is the bitonic sorter's
 * advantage over the radix sorter, which is limited to the natural order of the
 * key type but is considerably faster).
 *
 * All internal buffers, bind groups, per-step uniforms and pipelines are created
 * up front; `run` only records dispatches.
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

  const originalSize = keyBuffer.dataType.elementCount;
  const paddedSize = nextPowerOf2(originalSize);
  const wasPadded = paddedSize !== originalSize;

  if (valueBuffer && valueBuffer.dataType.elementCount !== originalSize) {
    throw new Error(
      `The values buffer (${valueBuffer.dataType.elementCount} elements) must match the key buffer (${originalSize} elements).`,
    );
  }

  const keyType = keyBuffer.dataType.elementType;
  const paddingValue = options?.paddingValue ?? defaultPaddingValues[keyType.type];
  const compareFunc = options?.compare ?? defaultCompares[keyType.type];

  const schemas = makeBitonicSchemas(keyType, valueBuffer?.dataType.elementType);
  const kernels = makeKernels(schemas);

  const ownedBuffers: { destroy(): void }[] = [];
  const steps: SortStep[] = [];

  const sortWorkgroups = decomposeWorkgroups(Math.ceil(paddedSize / 2 / WORKGROUP_SIZE));
  const padWorkgroups = decomposeWorkgroups(Math.ceil(paddedSize / WORKGROUP_SIZE));
  const copyBackWorkgroups = decomposeWorkgroups(Math.ceil(originalSize / WORKGROUP_SIZE));

  let workBuffer = keyBuffer;
  let workValuesBuffer = valueBuffer;
  let copyBackParamsBuffer:
    | (TgpuBuffer<BitonicSchemas['copyParamsType']> & UniformFlag)
    | undefined;

  const copyPadPipeline = wasPadded
    ? root.createComputePipeline({ compute: kernels.copyPadKernel })
    : undefined;
  const copyBackPipeline = wasPadded
    ? root.createComputePipeline({ compute: kernels.copyBackKernel })
    : undefined;
  const valsCopyPipeline =
    wasPadded && kernels.valsCopyKernel
      ? root.createComputePipeline({ compute: kernels.valsCopyKernel })
      : undefined;

  if (wasPadded && copyPadPipeline && copyBackPipeline) {
    workBuffer = root.createBuffer(d.arrayOf(keyType, paddedSize)).$usage('storage') as KeyBuffer;
    ownedBuffers.push(workBuffer);

    const copyPadParams = root
      .createBuffer(schemas.copyParamsType, {
        srcLength: originalSize,
        dstLength: paddedSize,
        paddingValue,
      })
      .$usage('uniform');
    copyBackParamsBuffer = root
      .createBuffer(schemas.copyParamsType, {
        srcLength: originalSize,
        dstLength: originalSize,
        paddingValue: 0,
      })
      .$usage('uniform');
    ownedBuffers.push(copyPadParams, copyBackParamsBuffer);

    steps.push({
      pipeline: copyPadPipeline.with(
        root.createBindGroup(schemas.copyLayout, {
          src: keyBuffer,
          dst: workBuffer,
          params: copyPadParams,
        }),
      ),
      workgroups: padWorkgroups,
    });

    if (valueBuffer && schemas.valsCopyLayout && valsCopyPipeline) {
      workValuesBuffer = root
        .createBuffer(d.arrayOf(valueBuffer.dataType.elementType, paddedSize))
        .$usage('storage') as ValueBuffer;
      ownedBuffers.push(workValuesBuffer);

      steps.push({
        pipeline: valsCopyPipeline.with(
          root.createBindGroup(schemas.valsCopyLayout, {
            src: valueBuffer,
            dst: workValuesBuffer,
            params: copyPadParams,
          }),
        ),
        workgroups: copyBackWorkgroups,
      });
    }
  }

  const valsBindGroup =
    schemas.valsLayout && workValuesBuffer
      ? root.createBindGroup(schemas.valsLayout, { vals: workValuesBuffer })
      : undefined;

  let sortPipeline = root.with(compareSlot, compareFunc).createComputePipeline({
    compute: kernels.bitonicStepKernel,
  });
  if (valsBindGroup) {
    sortPipeline = sortPipeline.with(valsBindGroup);
  }

  const valueTypeSize = valueBuffer ? d.sizeOf(valueBuffer.dataType.elementType) : 0;
  const sharedMemoryBytes = LOCAL_BLOCK * (d.sizeOf(keyType) + valueTypeSize);
  const workgroupStorageLimit = root.device.limits.maxComputeWorkgroupStorageSize || 16384;
  const useLocalKernels = paddedSize >= LOCAL_BLOCK && sharedMemoryBytes <= workgroupStorageLimit;

  function pushGlobalStep(k: number, j: number): void {
    const jShift = 31 - Math.clz32(j);
    const uniformBuffer = root.createBuffer(sortUniformsType, { k, jShift }).$usage('uniform');
    ownedBuffers.push(uniformBuffer);

    steps.push({
      pipeline: sortPipeline.with(
        root.createBindGroup(schemas.sortLayout, { data: workBuffer, uniforms: uniformBuffer }),
      ),
      workgroups: sortWorkgroups,
    });
  }

  if (useLocalKernels) {
    const localKernels = makeLocalKernels(schemas, valueBuffer?.dataType.elementType);
    let localSortPipeline = root.with(compareSlot, compareFunc).createComputePipeline({
      compute: localKernels.localSortKernel,
    });
    let localMergePipeline = root.with(compareSlot, compareFunc).createComputePipeline({
      compute: localKernels.localMergeKernel,
    });
    if (valsBindGroup) {
      localSortPipeline = localSortPipeline.with(valsBindGroup);
      localMergePipeline = localMergePipeline.with(valsBindGroup);
    }

    const blockWorkgroups = decomposeWorkgroups(paddedSize / LOCAL_BLOCK);

    function pushLocalStep(pipeline: TgpuComputePipeline, k: number): void {
      const uniformBuffer = root.createBuffer(sortUniformsType, { k, jShift: 0 }).$usage('uniform');
      ownedBuffers.push(uniformBuffer);

      steps.push({
        pipeline: pipeline.with(
          root.createBindGroup(schemas.sortLayout, { data: workBuffer, uniforms: uniformBuffer }),
        ),
        workgroups: blockWorkgroups,
      });
    }

    pushLocalStep(localSortPipeline, 0);
    for (let k = LOCAL_BLOCK * 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j >= LOCAL_BLOCK; j >>= 1) {
        pushGlobalStep(k, j);
      }
      pushLocalStep(localMergePipeline, k);
    }
  } else {
    for (let k = 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j > 0; j >>= 1) {
        pushGlobalStep(k, j);
      }
    }
  }

  if (wasPadded && copyBackPipeline && copyBackParamsBuffer) {
    steps.push({
      pipeline: copyBackPipeline.with(
        root.createBindGroup(schemas.copyLayout, {
          src: workBuffer,
          dst: keyBuffer,
          params: copyBackParamsBuffer,
        }),
      ),
      workgroups: copyBackWorkgroups,
    });

    if (valueBuffer && workValuesBuffer && schemas.valsCopyLayout && valsCopyPipeline) {
      steps.push({
        pipeline: valsCopyPipeline.with(
          root.createBindGroup(schemas.valsCopyLayout, {
            src: workValuesBuffer,
            dst: valueBuffer,
            params: copyBackParamsBuffer,
          }),
        ),
        workgroups: copyBackWorkgroups,
      });
    }
  }

  function run(runOptions?: BitonicSorterRunOptions): void {
    const recording = beginRunPass(root.device, runOptions);
    for (const step of steps) {
      step.pipeline.with(recording.pass).dispatchWorkgroups(...step.workgroups);
    }
    recording.finish();
  }

  function destroy(): void {
    for (const buffer of ownedBuffers) {
      buffer.destroy();
    }
  }

  return {
    originalSize,
    paddedSize,
    wasPadded,
    run,
    destroy,
  };
}
