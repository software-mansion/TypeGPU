import { d } from 'typegpu';
import type { TgpuComputePipeline, TgpuRoot, TgpuUniform, ValidateUniformSchema } from 'typegpu';
import type { OwnedGpuResource, PreparedDispatch } from './execution-plan.ts';
import type { ImmutableWeightStorage } from './gpu-resources.ts';
import { geluExact, identityActivation, relu, silu } from './kernels/helpers.ts';
import { MAX_COMPUTE_WORKGROUPS_PER_DIMENSION } from './kernels/types.ts';
import type { DepthTensorArena } from './tensor-arena.ts';
import {
  DepthActivation,
  DepthDType,
  DepthTensorLayout,
  type DepthBundle,
  type DepthDispatch,
  type DepthTensor,
  type DepthWeightSection,
} from './types.ts';

export interface Hwc4Shape {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly channelBlocks: number;
  readonly elementCount: number;
}

export interface PlainHwc4Shape extends Hwc4Shape {
  readonly dtype: typeof DepthDType.F32 | typeof DepthDType.F16;
}

/** Shared resource bookkeeping every per-op dispatch builder works through */
export interface DispatchContext {
  readonly root: TgpuRoot;
  readonly bundle: DepthBundle;
  readonly arena: DepthTensorArena;
  readonly weights: ImmutableWeightStorage;
  readonly dispatches: PreparedDispatch[];
  readonly ownedResources: OwnedGpuResource[];
  readonly own: <T extends OwnedGpuResource>(resource: T) => T;
  readonly uniform: <TSchema extends d.AnyWgslData>(
    schema: ValidateUniformSchema<TSchema>,
    value: d.InferInput<TSchema>,
  ) => TgpuUniform<TSchema>;
  readonly storageFromBytes: (bytes: Uint8Array) => GPUBuffer;
  readonly pipelineFor: (key: string, create: () => TgpuComputePipeline) => TgpuComputePipeline;
}

export function createDispatchContext(
  root: TgpuRoot,
  bundle: DepthBundle,
  arena: DepthTensorArena,
  weights: ImmutableWeightStorage,
): DispatchContext {
  const dispatches: PreparedDispatch[] = [];
  const ownedResources: OwnedGpuResource[] = [];
  const pipelines = new Map<string, TgpuComputePipeline>();
  const own = <T extends OwnedGpuResource>(resource: T): T => {
    ownedResources.push(resource);
    return resource;
  };
  return {
    root,
    bundle,
    arena,
    weights,
    dispatches,
    ownedResources,
    own,
    uniform: <TSchema extends d.AnyWgslData>(
      schema: ValidateUniformSchema<TSchema>,
      value: d.InferInput<TSchema>,
    ) => {
      const buffer = root.createUniform<TSchema>(schema, value);
      own(buffer.buffer);
      return buffer;
    },
    storageFromBytes: (bytes) =>
      root.unwrap(
        own(
          root
            .createBuffer(d.arrayOf(d.u32, bytes.byteLength / 4), (mapped) => {
              new Uint8Array(mapped.arrayBuffer).set(bytes);
            })
            .$usage('storage'),
        ),
      ),
    pipelineFor: (key, create) => {
      let pipeline = pipelines.get(key);
      if (!pipeline) {
        pipeline = create();
        pipelines.set(key, pipeline);
      }
      return pipeline;
    },
  };
}

export const ACTIVATION_FUNCTIONS = {
  [DepthActivation.None]: identityActivation,
  [DepthActivation.Gelu]: geluExact,
  [DepthActivation.Silu]: silu,
  [DepthActivation.Relu]: relu,
} as const;

export function dispatchTensor(
  bundle: DepthBundle,
  dispatch: DepthDispatch,
  side: 'inputs' | 'outputs',
  index: number,
): DepthTensor {
  const tensorId = dispatch[side][index];
  const tensor = tensorId === undefined ? undefined : bundle.tensorById.get(tensorId);
  if (tensor === undefined) {
    throw new Error(`Dispatch '${dispatch.id}' is missing ${side}[${index}].`);
  }
  return tensor;
}

export function plainHwc4Shape(tensor: DepthTensor): PlainHwc4Shape {
  if (tensor.layout !== DepthTensorLayout.Hwc4) {
    throw new Error(`Tensor '${tensor.id}' is not an HWC4 activation.`);
  }
  const [, channels = 0, height = 0, width = 0] = tensor.shape;
  const channelBlocks = Math.ceil(channels / 4);
  return {
    width,
    height,
    channels,
    channelBlocks,
    elementCount: width * height * channelBlocks,
    dtype: tensor.dtype,
  };
}

export function hwc4Shape(tensor: DepthTensor): Hwc4Shape {
  const shape = plainHwc4Shape(tensor);
  if (shape.dtype !== DepthDType.F32) {
    throw new Error(`Tensor '${tensor.id}' is not an FP32 HWC4 activation.`);
  }
  return shape;
}

export function usesNativeF16(tensor: DepthTensor): boolean {
  return tensor.dtype === DepthDType.F16;
}

export function sectionFor(bundle: DepthBundle, tensor: DepthTensor): DepthWeightSection {
  const section =
    tensor.storage.kind === 'section'
      ? bundle.weightSectionById.get(tensor.storage.sectionId)
      : undefined;
  if (section === undefined) {
    throw new Error(`Tensor '${tensor.id}' is not stored in a weight section.`);
  }
  return section;
}

export function sectionBinding(
  bundle: DepthBundle,
  weights: ImmutableWeightStorage,
  tensor: DepthTensor,
): GPUBuffer {
  const section = sectionFor(bundle, tensor);
  const buffer = weights.buffers.get(section.id);
  if (!buffer) {
    throw new Error(`Weight section '${section.id}' has not been uploaded.`);
  }
  return buffer.buffer;
}

function sectionByteOffset(tensor: DepthTensor): number {
  return tensor.storage.kind === 'section' ? tensor.storage.byteOffset : 0;
}

export function vec4Base(tensor: DepthTensor): number {
  return sectionByteOffset(tensor) / 16;
}

export function scalarBase(tensor: DepthTensor): number {
  return sectionByteOffset(tensor) / 4;
}

export function splitWorkgroups(count: number): { readonly x: number; readonly y: number } {
  return {
    x: Math.min(count, MAX_COMPUTE_WORKGROUPS_PER_DIMENSION),
    y: Math.ceil(count / MAX_COMPUTE_WORKGROUPS_PER_DIMENSION),
  };
}
