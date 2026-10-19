import { d } from 'typegpu';
import type { TgpuComputePipeline, TgpuRoot, TgpuUniform, ValidateUniformSchema } from 'typegpu';
import type { OwnedGpuResource, PreparedDispatch } from './execution-plan.ts';
import type { ImmutableWeightStorage, PackedWeightBuffer } from './gpu-resources.ts';
import { geluExact, identityActivation, relu, silu } from './kernels/helpers.ts';
import { MAX_COMPUTE_WORKGROUPS_PER_DIMENSION } from './kernels/types.ts';
import type { DepthTensorArena } from './tensor-arena.ts';
import {
  DepthActivation,
  DepthDType,
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
  return bundle.tensorById.get(dispatch[side][index]) as DepthTensor;
}

export function plainHwc4Shape(tensor: DepthTensor): PlainHwc4Shape {
  const [, channels, height, width] = tensor.shape as readonly [number, number, number, number];
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
  return plainHwc4Shape(tensor);
}

export function usesNativeF16(tensor: DepthTensor): boolean {
  return tensor.dtype === DepthDType.F16;
}

export function sectionFor(bundle: DepthBundle, tensor: DepthTensor): DepthWeightSection {
  const storage = tensor.storage as Extract<DepthTensor['storage'], { kind: 'section' }>;
  return bundle.weightSectionById.get(storage.sectionId) as DepthWeightSection;
}

export function sectionBinding(
  bundle: DepthBundle,
  weights: ImmutableWeightStorage,
  tensor: DepthTensor,
): GPUBuffer {
  const section = sectionFor(bundle, tensor);
  return (weights.buffers.get(section.id) as PackedWeightBuffer).buffer;
}

function sectionByteOffset(tensor: DepthTensor): number {
  return (tensor.storage as Extract<DepthTensor['storage'], { kind: 'section' }>).byteOffset;
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
