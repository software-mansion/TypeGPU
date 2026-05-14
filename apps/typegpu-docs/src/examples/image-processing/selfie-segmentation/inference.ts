import { d } from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import { type DispatchRecord, loadSegmenterPlan, OpKind, type SegmenterPlan } from './bundle.ts';
import { type KernelHandle, SegmenterKernelLibrary, type Vec4Buffer } from './kernels.ts';
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

  private readonly slots: Vec4Buffer[];
  private readonly dispatches: KernelHandle[];
  private readonly video: VideoPreprocessor;

  private constructor(root: TgpuRoot, plan: SegmenterPlan) {
    const [inputWidth, inputHeight] = plan.inputSize;
    const [outputWidth, outputHeight] = plan.outputSize;
    if (
      inputWidth !== MODEL_WIDTH ||
      inputHeight !== MODEL_HEIGHT ||
      outputWidth !== MODEL_WIDTH ||
      outputHeight !== MODEL_HEIGHT
    ) {
      throw new Error(
        `Bundle declares ${inputWidth}×${inputHeight} -> ` +
          `${outputWidth}×${outputHeight}; expected fixed ` +
          `${MODEL_WIDTH}×${MODEL_HEIGHT} segmentation.`,
      );
    }
    this.slots = plan.slotSizesVec4.map(
      (n) => root.createBuffer(d.arrayOf(d.vec4f, n)).$usage('storage') as Vec4Buffer,
    );
    const weights = root
      .createBuffer(d.arrayOf(d.vec4f, plan.weights.byteLength / 16))
      .$usage('storage') as Vec4Buffer;
    weights.write(plan.weights);

    const kernels = new SegmenterKernelLibrary(root, weights);
    this.dispatches = plan.dispatches.map((record) => this.buildDispatch(record, kernels));
    this.video = createVideoPreprocessor(root, inputWidth, inputHeight);
  }

  get maskBuffer(): Vec4Buffer {
    return this.slots[1];
  }

  encodeVideoFrame(
    pass: GPUComputePassEncoder,
    externalTexture: GPUExternalTexture,
    crop: VideoFrameCrop,
  ): void {
    this.video.encode(pass, externalTexture, crop, this.slots[0]);
    for (const handle of this.dispatches) {
      handle.pipeline.with(pass).with(handle.bindGroup).dispatchWorkgroups(handle.workgroups);
    }
  }

  private buildDispatch(record: DispatchRecord, kernels: SegmenterKernelLibrary): KernelHandle {
    const [srcA, srcB, dst] = record.slots;
    switch (record.opKind) {
      case OpKind.Conv:
        return kernels.createConv(record, {
          src: this.slots[srcA],
          dst: this.slots[dst],
        });
      case OpKind.DwConv:
        return kernels.createDepthwise(record, {
          src: this.slots[srcA],
          dst: this.slots[dst],
        });
      case OpKind.AvgPool:
        return kernels.createGlobalPool(record, {
          src: this.slots[srcA],
          dst: this.slots[dst],
        });
      case OpKind.Resize2x:
        return kernels.createResize2x(record, {
          src: this.slots[srcA],
          dst: this.slots[dst],
        });
      case OpKind.Add:
      case OpKind.Mul:
        return kernels.createBinary(record, {
          a: this.slots[srcA],
          b: this.slots[srcB],
          dst: this.slots[dst],
        });
      case OpKind.Head:
        return kernels.createHead(record, {
          src: this.slots[srcA],
          dst: this.slots[dst],
        });
    }
  }
}
