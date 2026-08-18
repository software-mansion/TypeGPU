import type { TgpuRoot } from 'typegpu';
import { createDepthDispatches, outerProductPointwiseWeights } from './dispatches.ts';
import {
  PreparedDispatchSequence,
  type DepthComputePass,
  type DepthRunOptions,
} from './execution-plan.ts';
import { createImmutableWeightStorage } from './gpu-resources.ts';
import { DepthFramePreprocessor, type DepthFrameCrop } from './preprocess.ts';
import { DepthTensorArena } from './tensor-arena.ts';
import type { DepthBundle, DepthTensor } from './types.ts';

export interface DepthInferenceStats {
  readonly dispatchCount: number;
  readonly pipelineCount: number;
  readonly weightBytes: number;
  readonly activationBytes: number;
}

function ioTensor(bundle: DepthBundle, tensorId: string): DepthTensor {
  const tensor = bundle.tensorById.get(tensorId);
  if (tensor === undefined) {
    throw new Error(`Depth bundle tensor '${tensorId}' is missing.`);
  }
  return tensor;
}

/** The bundle pins its own tensor shapes, so only device capability can still be missing. */
function assertSupportedBundle(bundle: DepthBundle, device: GPUDevice): void {
  for (const feature of bundle.requiredFeatures) {
    if (!device.features.has(feature as GPUFeatureName)) {
      throw new Error(`Depth bundle requires unavailable WebGPU feature '${feature}'.`);
    }
  }
}

/**
 * A prepared DepthART inference graph. Construction uploads weights and creates all
 * persistent resources; per-frame execution only updates preprocessing state and records work.
 */
export class DepthInferencePlan {
  readonly #root: TgpuRoot;
  readonly #bundle: DepthBundle;
  readonly #arena: DepthTensorArena;
  readonly #sequence: PreparedDispatchSequence;
  readonly #preprocessor: DepthFramePreprocessor;
  readonly #inputShape: readonly [1, 3, number, number];
  readonly #outputShape: readonly [1, 1, number, number];
  readonly #weights: ReturnType<typeof createImmutableWeightStorage>;
  #additionalWeightBytes = 0;
  #additionalActivationBytes = 0;
  #destroyed = false;

  constructor(root: TgpuRoot, bundle: DepthBundle) {
    assertSupportedBundle(bundle, root.device);
    const [, , inputHeight = 0, inputWidth = 0] = ioTensor(bundle, bundle.input.tensorId).shape;
    const [, , outputHeight = 0, outputWidth = 0] = ioTensor(bundle, bundle.output.tensorId).shape;

    this.#root = root;
    this.#bundle = bundle;
    this.#inputShape = [1, 3, inputHeight, inputWidth];
    this.#outputShape = [1, 1, outputHeight, outputWidth];
    const arena = new DepthTensorArena(root, bundle);
    let weights: ReturnType<typeof createImmutableWeightStorage> | undefined;
    let sequence: PreparedDispatchSequence | undefined;
    let preprocessor: DepthFramePreprocessor | undefined;
    try {
      weights = createImmutableWeightStorage(
        root,
        bundle.payload,
        outerProductPointwiseWeights(bundle),
      );
      const prepared = createDepthDispatches(root, bundle, arena, weights);
      this.#additionalWeightBytes = prepared.additionalWeightBytes;
      this.#additionalActivationBytes = prepared.additionalActivationBytes;
      sequence = new PreparedDispatchSequence(prepared.dispatches, prepared.ownedResources);
      preprocessor = new DepthFramePreprocessor(root, arena.inputBuffer, [inputWidth, inputHeight]);
    } catch (error) {
      preprocessor?.destroy();
      sequence?.destroy();
      weights?.buffer.destroy();
      arena.destroy();
      throw error;
    }
    this.#arena = arena;
    this.#weights = weights;
    this.#sequence = sequence;
    this.#preprocessor = preprocessor;
  }

  get bundle(): DepthBundle {
    return this.#bundle;
  }

  get inputShape(): readonly [1, 3, number, number] {
    return this.#inputShape;
  }

  get outputShape(): readonly [1, 1, number, number] {
    return this.#outputShape;
  }

  get inputBuffer(): GPUBuffer {
    this.#assertAlive();
    return this.#arena.inputBuffer.buffer;
  }

  get outputBuffer(): GPUBuffer {
    this.#assertAlive();
    return this.#arena.outputBuffer.buffer;
  }

  get stats(): DepthInferenceStats {
    const activationBytes = this.#bundle.slots.reduce(
      (total, slot) => total + slot.byteLength,
      ioTensor(this.#bundle, this.#bundle.input.tensorId).byteLength +
        ioTensor(this.#bundle, this.#bundle.output.tensorId).byteLength,
    );
    return {
      dispatchCount: this.#sequence.dispatchCount,
      pipelineCount: this.#sequence.pipelineCount,
      weightBytes: this.#bundle.payload.byteLength + this.#additionalWeightBytes,
      activationBytes: activationBytes + this.#additionalActivationBytes,
    };
  }

  initSync(): void {
    this.#assertAlive();
    this.#preprocessor.initSync();
    this.#sequence.initSync();
  }

  async initAsync(): Promise<void> {
    this.#assertAlive();
    await Promise.all([this.#preprocessor.initAsync(), this.#sequence.initAsync()]);
  }

  /** Records cubic RGB preprocessing and the complete graph into the same compute pass. */
  encodeFrame(pass: DepthComputePass, frame: GPUExternalTexture, crop: DepthFrameCrop): void {
    this.#assertAlive();
    this.#preprocessor.encode(pass, frame, crop);
    this.#sequence.encode(pass);
  }

  /**
   * Runs a frame immediately, or records it into a caller-owned pass/encoder.
   * Caller-owned encoders are not submitted by this method.
   */
  runFrame(frame: GPUExternalTexture, crop: DepthFrameCrop, options?: DepthRunOptions): void {
    this.#assertAlive();
    if (options?.pass) {
      this.encodeFrame(options.pass, frame, crop);
      return;
    }

    const externalEncoder = options?.encoder;
    if (externalEncoder) {
      const pass = externalEncoder.beginComputePass();
      this.encodeFrame(pass, frame, crop);
      pass.end();
      return;
    }

    const encoder = this.#root.device.createCommandEncoder({ label: 'DepthART frame inference' });
    const pass = encoder.beginComputePass({ label: 'DepthART frame inference' });
    this.encodeFrame(pass, frame, crop);
    pass.end();
    this.#root.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#preprocessor.destroy();
    this.#sequence.destroy();
    this.#arena.destroy();
    this.#weights.buffer.destroy();
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('Depth inference plan has been destroyed.');
    }
  }
}

export function createDepthInference(root: TgpuRoot, bundle: DepthBundle): DepthInferencePlan {
  return new DepthInferencePlan(root, bundle);
}
