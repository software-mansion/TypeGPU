import type { TgpuComputePass, TgpuComputePipeline, TgpuRoot } from 'typegpu';
import { outerProductPointwiseWeights } from './conv-dispatches.ts';
import { createDepthDispatches } from './dispatches.ts';
import { recordDispatch, type OwnedGpuResource, type PreparedDispatch } from './execution-plan.ts';
import { createImmutableWeightStorage, destroyImmutableWeightStorage } from './gpu-resources.ts';
import { DepthFramePreprocessor, type DepthFrameOptions } from './preprocess.ts';
import { DepthTensorArena } from './tensor-arena.ts';
import type { DepthBundle, DepthTensor } from './types.ts';

function ioTensor(bundle: DepthBundle, tensorId: string): DepthTensor {
  return bundle.tensorById.get(tensorId) as DepthTensor;
}

export class DepthInferencePlan {
  readonly #arena: DepthTensorArena;
  readonly #dispatches: readonly PreparedDispatch[];
  readonly #pipelines: readonly TgpuComputePipeline[];
  readonly #ownedResources: readonly OwnedGpuResource[];
  readonly #preprocessor: DepthFramePreprocessor;
  readonly #outputSize: readonly [width: number, height: number];
  readonly #weights: ReturnType<typeof createImmutableWeightStorage>;

  constructor(root: TgpuRoot, bundle: DepthBundle) {
    const [, , inputHeight, inputWidth] = ioTensor(bundle, bundle.input.tensorId).shape;
    const [, , outputHeight, outputWidth] = ioTensor(bundle, bundle.output.tensorId).shape;

    this.#outputSize = [outputWidth, outputHeight];
    this.#arena = new DepthTensorArena(root, bundle);
    this.#weights = createImmutableWeightStorage(
      root,
      bundle.weightSections,
      outerProductPointwiseWeights(bundle),
    );
    const prepared = createDepthDispatches(root, bundle, this.#arena, this.#weights);
    this.#dispatches = prepared.dispatches;
    this.#pipelines = [...new Set(prepared.dispatches.map((dispatch) => dispatch.pipeline))];
    this.#ownedResources = prepared.ownedResources;
    this.#preprocessor = new DepthFramePreprocessor(root, this.#arena.inputBuffer, [
      inputWidth,
      inputHeight,
    ]);
  }

  get outputSize(): readonly [width: number, height: number] {
    return this.#outputSize;
  }

  get outputBuffer(): GPUBuffer {
    return this.#arena.outputBuffer.buffer;
  }

  async initAsync(): Promise<void> {
    await Promise.all([
      this.#preprocessor.initAsync(),
      ...this.#pipelines.map((pipeline) => pipeline.initAsync()),
    ]);
  }

  encodeFrame(pass: TgpuComputePass, frame: GPUExternalTexture, options: DepthFrameOptions): void {
    this.#preprocessor.encode(pass, frame, options);
    for (const dispatch of this.#dispatches) {
      recordDispatch(pass, dispatch);
    }
  }

  destroy(): void {
    this.#preprocessor.destroy();
    for (const resource of this.#ownedResources) {
      resource.destroy();
    }
    this.#arena.destroy();
    destroyImmutableWeightStorage(this.#weights);
  }
}
