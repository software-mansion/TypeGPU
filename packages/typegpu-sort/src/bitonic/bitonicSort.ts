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
const MAX_WORKGROUPS_PER_DIMENSION = 65535;

function decomposeWorkgroups(total: number): [number, number, number] {
  if (total <= 0) {
    return [1, 1, 1];
  }

  const x = Math.min(total, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterX = Math.ceil(total / x);

  const y = Math.min(remainingAfterX, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterY = Math.ceil(remainingAfterX / y);

  const z = Math.min(remainingAfterY, MAX_WORKGROUPS_PER_DIMENSION);

  if (Math.ceil(total / (x * y * z)) > 1) {
    throw new Error(
      `Required workgroups (${total}) exceed device dispatch limits (${MAX_WORKGROUPS_PER_DIMENSION} per dimension)`,
    );
  }

  return [x, y, z];
}

const copyParamsType = d.struct({
  srcLength: d.u32,
  dstLength: d.u32,
  paddingValue: d.u32,
});

const sortUniformsType = d.struct({
  k: d.u32,
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
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const spanX = input.numWorkgroups.x * WORKGROUP_SIZE;
  const spanY = input.numWorkgroups.y * spanX;

  const idx = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

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
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const spanX = input.numWorkgroups.x * WORKGROUP_SIZE;
  const spanY = input.numWorkgroups.y * spanX;

  const idx = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  if (idx < copyLayout.$.params.srcLength) {
    copyLayout.$.dst[idx] = copyLayout.$.src[idx] as number;
  }
});

const bitonicStepKernel = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    numWorkgroups: d.builtin.numWorkgroups,
  },
})((input) => {
  const spanX = input.numWorkgroups.x * WORKGROUP_SIZE;
  const spanY = input.numWorkgroups.y * spanX;

  const tid = input.gid.x + input.gid.y * spanX + input.gid.z * spanY;

  const k = sortLayout.$.uniforms.k;
  const shift = sortLayout.$.uniforms.jShift;
  const dataLength = d.u32(sortLayout.$.data.length);
  const stride = 1 << shift;

  const maskBelow = stride - 1;
  const below = tid & maskBelow;
  const above = tid >> shift;

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
  }
});

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

  let paddingResources: {
    workBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;
    copyPadParams: TgpuBuffer<typeof copyParamsType> & UniformFlag;
    copyBackParams: TgpuBuffer<typeof copyParamsType> & UniformFlag;
    copyPadBindGroup: TgpuBindGroup<(typeof copyLayout)['entries']>;
    copyBackBindGroup: TgpuBindGroup<(typeof copyLayout)['entries']>;
  } | null = null;
  let workBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

  const sortWorkgroupsTotal = Math.ceil(paddedSize / 2 / WORKGROUP_SIZE);
  const [sortWorkgroupsX, sortWorkgroupsY, sortWorkgroupsZ] =
    decomposeWorkgroups(sortWorkgroupsTotal);

  const padWorkgroupsTotal = Math.ceil(paddedSize / WORKGROUP_SIZE);
  const [padWorkgroupsX, padWorkgroupsY, padWorkgroupsZ] = decomposeWorkgroups(
    padWorkgroupsTotal,
  );

  const copyBackWorkgroupsTotal = Math.ceil(originalSize / WORKGROUP_SIZE);
  const [copyBackWorkgroupsX, copyBackWorkgroupsY, copyBackWorkgroupsZ] =
    decomposeWorkgroups(copyBackWorkgroupsTotal);

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

  const uniformBuffer = root.createBuffer(sortUniformsType).$usage('uniform');

  const sortBindGroup = root.createBindGroup(sortLayout, {
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

  const log2N = Math.log2(paddedSize);
  const totalSteps = (log2N * (log2N + 1)) / 2;

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
      pipeline.dispatchWorkgroups(
        padWorkgroupsX,
        padWorkgroupsY,
        padWorkgroupsZ,
      );
    }

    let stepIndex = 0;
    for (let k = 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j > 0; j >>= 1) {
        const jShift = 31 - Math.clz32(j);
        uniformBuffer.write({ k, jShift });

        let pipeline = sortPipeline.with(sortBindGroup);

        if (querySet && !paddingResources) {
          const isFirst = stepIndex === 0;
          const isLast = stepIndex === totalSteps - 1;
          if (isFirst || isLast) {
            pipeline = pipeline.withTimestampWrites({
              querySet,
              ...(isFirst && { beginningOfPassWriteIndex: 0 }),
              ...(isLast && { endOfPassWriteIndex: 1 }),
            });
          }
        }

        pipeline.dispatchWorkgroups(
          sortWorkgroupsX,
          sortWorkgroupsY,
          sortWorkgroupsZ,
        );
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
      pipeline.dispatchWorkgroups(
        copyBackWorkgroupsX,
        copyBackWorkgroupsY,
        copyBackWorkgroupsZ,
      );
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
