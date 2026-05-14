import { d } from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import { loadSegmenterPlan, type SegmenterPlan } from './bundle.ts';
import {
  createSegmenterDispatches,
  type KernelHandle,
  type MaskBuffer,
  type PackedWeightsBuffer,
  type Vec4Buffer,
} from './kernels.ts';
import {
  createVideoPreprocessor,
  type VideoFrameCrop,
  type VideoPreprocessor,
} from './video-preprocess.ts';

export type { VideoFrameCrop } from './video-preprocess.ts';

export const MODEL_WIDTH = 256;
export const MODEL_HEIGHT = 256;

const DEFAULT_BUNDLE_URL = '/TypeGPU/assets/selfie-segmentation/selfie_segmenter.ssgbin';

export class SelfieSegmenterInference {
  static async create(
    root: TgpuRoot,
    bundleUrl: string = DEFAULT_BUNDLE_URL,
  ): Promise<SelfieSegmenterInference> {
    return new SelfieSegmenterInference(root, await loadSegmenterPlan(bundleUrl));
  }

  readonly #input: Vec4Buffer;
  readonly #mask: MaskBuffer;
  readonly #dispatches: KernelHandle[];
  readonly #video: VideoPreprocessor;

  private constructor(root: TgpuRoot, plan: SegmenterPlan) {
    this.#mask = root
      .createBuffer(d.arrayOf(d.f32, plan.slotSizesVec4[1]))
      .$usage('storage') as MaskBuffer;
    const slots = plan.slotSizesVec4.map((n, slot) =>
      slot === 1
        ? (this.#mask as unknown as Vec4Buffer)
        : (root.createBuffer(d.arrayOf(d.vec4f, n)).$usage('storage') as Vec4Buffer),
    );
    this.#input = slots[0];
    const weights = root
      .createBuffer(d.arrayOf(d.u32, plan.weights.byteLength / Uint32Array.BYTES_PER_ELEMENT))
      .$usage('storage') as PackedWeightsBuffer;
    weights.write(plan.weights);

    this.#dispatches = createSegmenterDispatches(root, plan.dispatches, slots, this.#mask, weights);
    this.#video = createVideoPreprocessor(root, MODEL_WIDTH, MODEL_HEIGHT);
  }

  get maskBuffer(): MaskBuffer {
    return this.#mask;
  }

  encodeVideoFrame(
    pass: GPUComputePassEncoder,
    externalTexture: GPUExternalTexture,
    crop: VideoFrameCrop,
  ): void {
    this.#video.encode(pass, externalTexture, crop, this.#input);
    for (const handle of this.#dispatches) {
      handle.pipeline.with(pass).with(handle.bindGroup).dispatchWorkgroups(handle.workgroups);
    }
  }
}
