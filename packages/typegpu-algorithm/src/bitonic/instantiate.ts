import type { d, StorageFlag, TgpuBuffer, TgpuComputePipeline, TgpuRoot } from 'typegpu';
import {
  createLifecycle,
  type Dispatch,
  dispatchAll,
  initPipelinesAsync,
  initPipelinesSync,
} from '../instance.ts';
import { decomposeWorkgroups } from '../workgroups.ts';
import { LOCAL_BLOCK, WORKGROUP_SIZE } from './constants.ts';
import type { BitonicKeyType } from './kernels.ts';
import type { BitonicSortDefinition, BitonicSortInstance, BitonicSortIo } from './types.ts';

type KeyBuffer = TgpuBuffer<d.WgslArray<BitonicKeyType>> & StorageFlag;
type ValueBuffer = TgpuBuffer<d.WgslArray<d.AnyWgslData>> & StorageFlag;

function nextPowerOf2(n: number): number {
  if (n <= 1) {
    return 1;
  }
  return 1 << (32 - Math.clz32(n - 1));
}

function unchanged(pipeline: TgpuComputePipeline): TgpuComputePipeline {
  return pipeline;
}

/**
 * Allocates the padded copies, per-stage uniforms and bind groups for sorting `io.keys`, and
 * picks the variant that fits the size and `root.device`. `step` only records dispatches.
 * @category Module
 */
export function instantiate<TKey extends BitonicKeyType, TValue extends d.AnyWgslData>(
  root: TgpuRoot,
  definition: BitonicSortDefinition,
  io: BitonicSortIo<TKey, TValue>,
): BitonicSortInstance {
  const keyBuffer = io.keys as KeyBuffer;
  const valueBuffer = io.values as ValueBuffer | undefined;
  const size = keyBuffer.dataType.elementCount;
  const paddedSize = nextPowerOf2(size);
  const isPadded = paddedSize !== size;

  if (size === 0) {
    throw new Error('bitonicSort: cannot sort an empty buffer.');
  }
  if (keyBuffer.dataType.elementType !== definition.keyType) {
    throw new Error(
      `bitonicSort: the keys buffer holds ${keyBuffer.dataType.elementType.type} elements, but the definition was made for ${definition.keyType.type}.`,
    );
  }
  if ((valueBuffer === undefined) !== (definition.valueType === undefined)) {
    throw new Error(
      definition.valueType
        ? 'bitonicSort: the definition has a `valueType`, so `values` is required.'
        : 'bitonicSort: `values` requires a `valueType` in the definition.',
    );
  }
  if (valueBuffer && valueBuffer.dataType.elementCount !== size) {
    throw new Error(
      `bitonicSort: the values buffer (${valueBuffer.dataType.elementCount} elements) must match the keys buffer (${size} elements).`,
    );
  }

  const variant = isPadded ? definition.padded : definition.dense;
  const owned: { destroy(): void }[] = [];
  const dispatches: Dispatch[] = [];
  const pipelines: TgpuComputePipeline[] = [];

  let workKeys = keyBuffer;
  let workValues = valueBuffer;
  let unpad: Dispatch | undefined;
  let bindValid: (pipeline: TgpuComputePipeline) => TgpuComputePipeline = unchanged;

  if (isPadded) {
    const valid = root.createBuffer(definition.validArray(paddedSize)).$usage('storage');
    workKeys = root.createBuffer(definition.keyArray(paddedSize)).$usage('storage') as KeyBuffer;
    owned.push(valid, workKeys);
    const validBg = root.createBindGroup(definition.validLayout, { valid });
    bindValid = (pipeline) => pipeline.with(validBg);

    let padPipeline = definition.pad
      .with(validBg)
      .with(root.createBindGroup(definition.copyLayout, { src: keyBuffer, dst: workKeys }));
    let unpadPipeline = definition.unpad.with(
      root.createBindGroup(definition.copyLayout, { src: workKeys, dst: keyBuffer }),
    );

    if (valueBuffer && definition.valueArray) {
      workValues = root
        .createBuffer(definition.valueArray(paddedSize))
        .$usage('storage') as ValueBuffer;
      owned.push(workValues);
      padPipeline = padPipeline.with(
        root.createBindGroup(definition.valuesCopyLayout, {
          srcVals: valueBuffer,
          dstVals: workValues,
        }),
      );
      unpadPipeline = unpadPipeline.with(
        root.createBindGroup(definition.valuesCopyLayout, {
          srcVals: workValues,
          dstVals: valueBuffer,
        }),
      );
    }

    pipelines.push(definition.pad, definition.unpad);
    dispatches.push({
      pipeline: padPipeline,
      workgroups: decomposeWorkgroups(Math.ceil(paddedSize / WORKGROUP_SIZE)),
    });
    unpad = {
      pipeline: unpadPipeline,
      workgroups: decomposeWorkgroups(Math.ceil(size / WORKGROUP_SIZE)),
    };
  }

  const dataBg = root.createBindGroup(definition.dataLayout, { data: workKeys });
  const valsBg = workValues
    ? root.createBindGroup(definition.valsLayout, { vals: workValues })
    : undefined;

  function bindData(pipeline: TgpuComputePipeline): TgpuComputePipeline {
    pipelines.push(pipeline);
    const bound = bindValid(pipeline).with(dataBg);
    return valsBg ? bound.with(valsBg) : bound;
  }

  function pushStage(
    pipeline: TgpuComputePipeline,
    k: number,
    jShift: number,
    workgroups: [number, number, number],
  ): void {
    const uniforms = root
      .createBuffer(definition.stepUniformsType, { k, jShift })
      .$usage('uniform');
    owned.push(uniforms);
    dispatches.push({
      pipeline: pipeline.with(root.createBindGroup(definition.stepLayout, { uniforms })),
      workgroups,
    });
  }

  const useLocalKernels =
    paddedSize >= LOCAL_BLOCK &&
    variant.localStorageSize <= root.device.limits.maxComputeWorkgroupStorageSize;
  const globalWorkgroups = decomposeWorkgroups(Math.ceil(paddedSize / 2 / WORKGROUP_SIZE));
  const globalStep = bindData(variant.globalStep);

  if (useLocalKernels) {
    const localMerge = bindData(variant.localMerge);
    const blockWorkgroups = decomposeWorkgroups(paddedSize / LOCAL_BLOCK);

    dispatches.push({ pipeline: bindData(variant.localSort), workgroups: blockWorkgroups });
    for (let k = LOCAL_BLOCK * 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j >= LOCAL_BLOCK; j >>= 1) {
        pushStage(globalStep, k, Math.log2(j), globalWorkgroups);
      }
      pushStage(localMerge, k, 0, blockWorkgroups);
    }
  } else {
    for (let k = 2; k <= paddedSize; k <<= 1) {
      for (let j = k >> 1; j > 0; j >>= 1) {
        pushStage(globalStep, k, Math.log2(j), globalWorkgroups);
      }
    }
  }

  if (unpad) {
    dispatches.push(unpad);
  }

  const lifecycle = createLifecycle('bitonicSort', owned);

  return {
    size,
    paddedSize,

    step(pass) {
      lifecycle.assertAlive('step');
      dispatchAll(pass, dispatches);
    },

    initSync() {
      lifecycle.assertAlive('initSync');
      initPipelinesSync(pipelines);
    },

    async initAsync() {
      lifecycle.assertAlive('initAsync');
      await initPipelinesAsync(pipelines);
    },

    destroy: lifecycle.destroy,
    [Symbol.dispose]: lifecycle.destroy,
  };
}
