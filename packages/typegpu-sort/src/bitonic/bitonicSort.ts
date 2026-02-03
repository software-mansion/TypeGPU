import tgpu, {
  d,
  std,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuBuffer,
  type TgpuRoot,
  type UniformFlag,
} from 'typegpu';
import { compareSlot, defaultCompare } from './slots.ts';
import type {
  BitonicSorter,
  BitonicSorterOptions,
  BitonicSorterRunOptions,
} from './types.ts';
import { nextPowerOf2 } from './utils.ts';

const WORKGROUP_SIZE = 256;

const copyParamsType = d.struct({
  srcLength: d.u32,
  dstLength: d.u32,
  paddingValue: d.u32,
});

const sortUniformsType = d.struct({
  k: d.u32,
  j: d.u32,
  jShift: d.u32,
});

const sortLayout = tgpu.bindGroupLayout({
  data: {
    storage: d.arrayOf(d.u32),
    access: 'mutable',
  },
  uniforms: {
    uniform: sortUniformsType,
  },
});

const copyLayout = tgpu.bindGroupLayout({
  src: {
    storage: d.arrayOf(d.u32),
    access: 'readonly',
  },
  dst: {
    storage: d.arrayOf(d.u32),
    access: 'mutable',
  },
  params: {
    uniform: copyParamsType,
  },
});

const copyPadKernel = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const idx = input.gid.x;
  const dstLength = copyLayout.$.params.dstLength;
  const srcLength = copyLayout.$.params.srcLength;

  if (idx >= dstLength) {
    return;
  }

  copyLayout.$.dst[idx] = std.select(
    copyLayout.$.params.paddingValue,
    copyLayout.$.src[idx] as number,
    idx < srcLength,
  );
});

const copyBackKernel = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const idx = input.gid.x;
  if (idx < copyLayout.$.params.srcLength) {
    copyLayout.$.dst[idx] = copyLayout.$.src[idx] as number;
  }
});

const bitonicStepKernel = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const tid = input.gid.x;

  const k = sortLayout.$.uniforms.k;
  const shift = sortLayout.$.uniforms.jShift;
  const dataLength = d.u32(sortLayout.$.data.length);

  const maskBelow = (1 << shift) - 1;
  const below = tid & maskBelow;
  const above = (tid >> shift) << (shift + 1);

  const i = above | below;
  const ixj = i | (1 << shift);

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
  }
});

type CopyParamsBuffer = TgpuBuffer<typeof copyParamsType> & UniformFlag;
type SortUniformsBuffer = TgpuBuffer<typeof sortUniformsType> & UniformFlag;
type CopyBindGroup = TgpuBindGroup<(typeof copyLayout)['entries']>;
type SortBindGroup = TgpuBindGroup<(typeof sortLayout)['entries']>;

interface PaddingResources {
  workBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;
  copyPadParams: CopyParamsBuffer;
  copyBackParams: CopyParamsBuffer;
  copyPadBindGroup: CopyBindGroup;
  copyBackBindGroup: CopyBindGroup;
}

export function createBitonicSorter(
  root: TgpuRoot,
  data: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  options?: BitonicSorterOptions,
): BitonicSorter {
  const originalSize = data.dataType.elementCount;
  const paddedSize = nextPowerOf2(originalSize);
  const wasPadded = paddedSize !== originalSize;

  const paddingValue = options?.paddingValue ?? 0xffffffff;
  const compareFunc = options?.compare ?? defaultCompare;

  // Resources for padding (only created if needed)
  let paddingResources: PaddingResources | null = null;
  let workBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

  if (wasPadded) {
    const paddedWorkBuffer = root
      .createBuffer(d.arrayOf(d.u32, paddedSize))
      .$usage('storage');

    const copyPadParams = root
      .createBuffer(copyParamsType, {
        srcLength: originalSize,
        dstLength: paddedSize,
        paddingValue,
      })
      .$usage('uniform');

    const copyBackParams = root
      .createBuffer(copyParamsType, {
        srcLength: originalSize,
        dstLength: originalSize,
        paddingValue: 0,
      })
      .$usage('uniform');

    paddingResources = {
      workBuffer: paddedWorkBuffer,
      copyPadParams,
      copyBackParams,
      copyPadBindGroup: root.createBindGroup(copyLayout, {
        src: data,
        dst: paddedWorkBuffer,
        params: copyPadParams,
      }),
      copyBackBindGroup: root.createBindGroup(copyLayout, {
        src: paddedWorkBuffer,
        dst: data,
        params: copyBackParams,
      }),
    };

    workBuffer = paddedWorkBuffer;
  } else {
    workBuffer = data;
  }

  const uniformBuffer: SortUniformsBuffer = root
    .createBuffer(sortUniformsType)
    .$usage('uniform');

  const sortBindGroup: SortBindGroup = root.createBindGroup(sortLayout, {
    data: workBuffer,
    uniforms: uniformBuffer,
  });

  const sortPipeline = root['~unstable']
    .with(compareSlot, compareFunc)
    .withCompute(bitonicStepKernel)
    .createPipeline();

  const copyPadPipeline = root['~unstable']
    .withCompute(copyPadKernel)
    .createPipeline();

  const copyBackPipeline = root['~unstable']
    .withCompute(copyBackKernel)
    .createPipeline();

  const halfSize = paddedSize / 2;
  const sortWorkgroups = Math.ceil(halfSize / WORKGROUP_SIZE);
  const padWorkgroups = Math.ceil(paddedSize / WORKGROUP_SIZE);
  const copyBackWorkgroups = Math.ceil(originalSize / WORKGROUP_SIZE);

  let totalSteps = 0;
  for (let k = 2; k <= paddedSize; k <<= 1) {
    for (let j = k >> 1; j > 0; j >>= 1) {
      totalSteps++;
    }
  }

  function run(runOptions?: BitonicSorterRunOptions): void {
    const querySet = runOptions?.querySet;

    if (paddingResources) {
      let pipeline = copyPadPipeline.with(paddingResources.copyPadBindGroup);
      if (querySet) {
        pipeline = pipeline.withTimestampWrites({
          querySet,
          beginningOfPassWriteIndex: 0,
        });
      }
      pipeline.dispatchWorkgroups(padWorkgroups);
    }

    let stepIndex = 0;
    for (let k = 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j > 0; j >>= 1) {
        const jShift = 31 - Math.clz32(j);
        uniformBuffer.write({ k, j, jShift });

        let pipeline = sortPipeline.with(sortBindGroup);

        if (querySet && !paddingResources) {
          const isFirstStep = stepIndex === 0;
          const isLastStep = stepIndex === totalSteps - 1;
          if (isFirstStep && isLastStep) {
            pipeline = pipeline.withTimestampWrites({
              querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            });
          } else if (isFirstStep) {
            pipeline = pipeline.withTimestampWrites({
              querySet,
              beginningOfPassWriteIndex: 0,
            });
          } else if (isLastStep) {
            pipeline = pipeline.withTimestampWrites({
              querySet,
              endOfPassWriteIndex: 1,
            });
          }
        }

        pipeline.dispatchWorkgroups(sortWorkgroups);
        stepIndex++;
      }
    }

    if (paddingResources) {
      let pipeline = copyBackPipeline.with(paddingResources.copyBackBindGroup);
      if (querySet) {
        pipeline = pipeline.withTimestampWrites({
          querySet,
          endOfPassWriteIndex: 1,
        });
      }
      pipeline.dispatchWorkgroups(copyBackWorkgroups);
    }
  }

  function destroy(): void {
    uniformBuffer.destroy();
    if (paddingResources) {
      paddingResources.workBuffer.destroy();
      paddingResources.copyPadParams.destroy();
      paddingResources.copyBackParams.destroy();
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
