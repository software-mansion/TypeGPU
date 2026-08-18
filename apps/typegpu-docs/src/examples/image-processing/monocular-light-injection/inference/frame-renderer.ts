import { d } from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import { DepthInferencePlan } from './depthart.ts';
import { DepthDisparityPresenter } from './disparity-presenter.ts';
import { DepthInputPresenter } from './input-presenter.ts';

export interface DepthFrameRenderOptions {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly centerCrop?: boolean;
  readonly uvTransform?: d.m2x2f;
  readonly swapAxes?: boolean;
  readonly presentInput?: boolean;
}

export interface DepthFrameTiming {
  readonly totalMilliseconds: number;
  readonly encodeMilliseconds: number;
  readonly queueMilliseconds: number;
}

/**
 * Owns the two canvas presenters and the single-submission frame path around a
 * prepared inference plan. It does not own the plan or external frame source.
 */
export class DepthFrameRenderer {
  readonly #root: TgpuRoot;
  readonly #disparityPresenter: DepthDisparityPresenter;
  readonly #inputPresenter: DepthInputPresenter;
  #plan: DepthInferencePlan | undefined;
  #destroyed = false;

  constructor(root: TgpuRoot, disparityCanvas: HTMLCanvasElement, inputCanvas: HTMLCanvasElement) {
    this.#root = root;
    this.#disparityPresenter = new DepthDisparityPresenter(root, disparityCanvas);
    this.#inputPresenter = new DepthInputPresenter(root, inputCanvas);
  }

  async initAsync(): Promise<void> {
    await Promise.all([this.#disparityPresenter.initAsync(), this.#inputPresenter.initAsync()]);
  }

  attach(plan: DepthInferencePlan): void {
    this.detach();
    const [, , outputHeight, outputWidth] = plan.outputShape;
    const [, , inputHeight, inputWidth] = plan.inputShape;
    this.#disparityPresenter.attach(plan.outputBuffer, outputWidth, outputHeight);
    this.#inputPresenter.attach(plan.inputBuffer, inputWidth, inputHeight);
    this.#plan = plan;
  }

  detach(): void {
    this.#disparityPresenter.detach();
    this.#inputPresenter.detach();
    this.#plan = undefined;
  }

  clear(): void {
    this.#disparityPresenter.clear();
  }

  async render(
    source: HTMLVideoElement | VideoFrame,
    options: DepthFrameRenderOptions,
  ): Promise<DepthFrameTiming> {
    const plan = this.#plan;
    if (!plan) {
      throw new Error('No depth inference plan is attached to the frame renderer.');
    }
    const { sourceWidth, sourceHeight } = options;

    const frame = this.#root.device.importExternalTexture({ source });
    const startedAt = performance.now();
    const encoder = this.#root.device.createCommandEncoder({
      label: 'DepthART frame inference and presentation',
    });
    const cropSize = options.centerCrop ? Math.min(sourceWidth, sourceHeight) : undefined;
    plan.runFrame(
      frame,
      {
        sourceSize: [sourceWidth, sourceHeight],
        cropOrigin: cropSize
          ? [(sourceWidth - cropSize) * 0.5, (sourceHeight - cropSize) * 0.5]
          : [0, 0],
        cropSize: cropSize ? [cropSize, cropSize] : [sourceWidth, sourceHeight],
        uvTransform: options.uvTransform,
        gpuSquareCrop: options.centerCrop,
        swapAxes: options.swapAxes,
      },
      { encoder },
    );
    if (options.presentInput) {
      this.#inputPresenter.encode(encoder);
    }
    this.#disparityPresenter.encode(encoder, true);
    this.#root.device.queue.submit([encoder.finish()]);
    const submittedAt = performance.now();
    await this.#root.device.queue.onSubmittedWorkDone();
    const completedAt = performance.now();
    return {
      totalMilliseconds: completedAt - startedAt,
      encodeMilliseconds: submittedAt - startedAt,
      queueMilliseconds: completedAt - submittedAt,
    };
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#plan = undefined;
    this.#disparityPresenter.destroy();
    this.#inputPresenter.destroy();
  }
}
