import tgpu, {
  d,
  std,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuQuerySet,
  type TgpuRoot,
} from 'typegpu';
import { compareSlot, defaultCompare } from './slots.ts';
import type { BitonicSortOptions, BitonicSortResult } from './types.ts';
import { nextPowerOf2 } from './utils.ts';

const WORKGROUP_SIZE = 256;

const sortLayout = tgpu.bindGroupLayout({
  data: {
    storage: d.arrayOf(d.u32),
    access: 'mutable',
  },
  uniforms: {
    uniform: d.struct({
      k: d.u32,
      j: d.u32,
      jShift: d.u32, // log2(j), used for optimized index calculation
    }),
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
    uniform: d.struct({
      srcLength: d.u32,
      dstLength: d.u32,
      paddingValue: d.u32,
    }),
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

  // We are processing N/2 threads.
  // Calculate index 'i' by inserting a 0 bit at position 'shift'.
  // This ensures 'i' and 'ixj' (with bit at 'shift' set to 1) form a valid pair.
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

export function bitonicSort(
  root: TgpuRoot,
  data: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag,
  options?: BitonicSortOptions,
): BitonicSortResult {
  const originalSize = data.dataType.elementCount;
  const paddedSize = nextPowerOf2(originalSize);
  const wasPadded = paddedSize !== originalSize;

  const paddingValue = options?.paddingValue ?? 0xffffffff;
  const compareFunc = options?.compare ?? defaultCompare;
  const querySet = options?.querySet;

  let workBuffer: TgpuBuffer<d.WgslArray<d.U32>> & StorageFlag;

  if (wasPadded) {
    workBuffer = root
      .createBuffer(d.arrayOf(d.u32, paddedSize))
      .$usage('storage');

    const copyParams = root.createBuffer(
      d.struct({ srcLength: d.u32, dstLength: d.u32, paddingValue: d.u32 }),
      { srcLength: originalSize, dstLength: paddedSize, paddingValue },
    ).$usage('uniform');

    let copyPadPipeline = root['~unstable']
      .withCompute(copyPadKernel)
      .createPipeline();

    if (querySet) {
      copyPadPipeline = copyPadPipeline.withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
      });
    }

    copyPadPipeline
      .with(
        root.createBindGroup(copyLayout, {
          src: data,
          dst: workBuffer,
          params: copyParams,
        }),
      )
      .dispatchWorkgroups(Math.ceil(paddedSize / WORKGROUP_SIZE));

    copyParams.destroy();
  } else {
    workBuffer = data;
  }

  const uniformBuffer = root
    .createBuffer(d.struct({ k: d.u32, j: d.u32, jShift: d.u32 }))
    .$usage('uniform');

  const bindGroup = root.createBindGroup(sortLayout, {
    data: workBuffer,
    uniforms: uniformBuffer,
  });

  const pipeline = root['~unstable']
    .with(compareSlot, compareFunc)
    .withCompute(bitonicStepKernel)
    .createPipeline();

  // We dispatch N/2 threads because each thread processes 2 elements
  const halfSize = paddedSize / 2;
  const workgroups = Math.ceil(halfSize / WORKGROUP_SIZE);

  // Count total steps for timestamp tracking (only for non-padded case)
  let totalSteps = 0;
  for (let k = 2; k <= paddedSize; k <<= 1) {
    for (let j = k >> 1; j > 0; j >>= 1) {
      totalSteps++;
    }
  }

  let stepIndex = 0;

  for (let k = 2; k <= paddedSize; k <<= 1) {
    for (let j = k >> 1; j > 0; j >>= 1) {
      // Calculate jShift = log2(j). Since j is power of 2, use clz32.
      const jShift = 31 - Math.clz32(j);
      uniformBuffer.write({ k, j, jShift });

      const isFirstStep = stepIndex === 0;
      const isLastStep = stepIndex === totalSteps - 1;

      let boundPipeline = pipeline.with(bindGroup);

      // For non-padded case, attach timestamps to first/last sort steps
      if (querySet && !wasPadded && (isFirstStep || isLastStep)) {
        const descriptor: {
          querySet: TgpuQuerySet<'timestamp'>;
          beginningOfPassWriteIndex?: number;
          endOfPassWriteIndex?: number;
        } = { querySet };
        if (isFirstStep) {
          descriptor.beginningOfPassWriteIndex = 0;
        }
        if (isLastStep) {
          descriptor.endOfPassWriteIndex = 1;
        }
        boundPipeline = boundPipeline.withTimestampWrites(descriptor);
      }

      boundPipeline.dispatchWorkgroups(workgroups);
      stepIndex++;
    }
  }

  if (wasPadded) {
    const copyParams = root
      .createBuffer(
        d.struct({ srcLength: d.u32, dstLength: d.u32, paddingValue: d.u32 }),
        { srcLength: originalSize, dstLength: originalSize, paddingValue: 0 },
      ).$usage('uniform');

    let copyBackPipeline = root['~unstable']
      .withCompute(copyBackKernel)
      .createPipeline();

    if (querySet) {
      copyBackPipeline = copyBackPipeline.withTimestampWrites({
        querySet,
        endOfPassWriteIndex: 1,
      });
    }

    copyBackPipeline
      .with(
        root.createBindGroup(copyLayout, {
          src: workBuffer,
          dst: data,
          params: copyParams,
        }),
      )
      .dispatchWorkgroups(Math.ceil(originalSize / WORKGROUP_SIZE));

    copyParams.destroy();
    workBuffer.destroy();
  }

  uniformBuffer.destroy();

  return { originalSize, paddedSize, wasPadded };
}
