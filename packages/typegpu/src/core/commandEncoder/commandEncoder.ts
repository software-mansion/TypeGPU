import { $internal } from '../../shared/symbols.ts';
import { logger } from '../../tgpuLogger.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import {
  INTERNAL_beginComputePass,
  type TgpuComputePass,
  type TgpuComputePassDescriptor,
} from './computePass.ts';
import {
  INTERNAL_beginRenderPass,
  type TgpuRenderPass,
  type TgpuRenderPassDescriptor,
} from './renderPass.ts';

// ----------
// Public API
// ----------

export interface CommandEncoderInternals {
  readonly rawEncoder: GPUCommandEncoder;
  readonly root: ExperimentalTgpuRoot;
  /** A caller-owned raw encoder, so submission is out of our hands and no work can be deferred */
  readonly adopted: boolean;
  /** Commands recorded just before the encoder is finished, keyed for deduplication */
  readonly beforeFinish: Map<object, (rawEncoder: GPUCommandEncoder) => void>;
  /** Callbacks run once the recorded commands have been submitted, keyed for deduplication */
  readonly afterSubmit: Map<object, () => void>;
}

/**
 * The TypeGPU equivalent of {@link GPUCommandEncoder}, for batching multiple
 * passes (and draws within them) into a single submission.
 *
 * @example
 * ```ts
 * const encoder = root['~unstable'].createCommandEncoder();
 * const pass = encoder.beginRenderPass({
 *   colorAttachments: [{ view: msaaTexture, resolveTarget: context }],
 * });
 * scenePipeline.with(pass).draw(vertexCount);
 * skyPipeline.with(pass).draw(3);
 * pass.end();
 * encoder.submit();
 * ```
 *
 * For anything not covered by the typed surface (e.g. texture copies), grab
 * the raw encoder via `root.unwrap(encoder)`.
 */
export interface TgpuCommandEncoder {
  readonly [$internal]: CommandEncoderInternals;
  readonly resourceType: 'command-encoder';

  /**
   * Begins recording a render pass. Attachment views accept TypeGPU textures,
   * texture views and canvas contexts, next to raw {@link GPUTextureView}s.
   */
  beginRenderPass(descriptor: TgpuRenderPassDescriptor): TgpuRenderPass;

  /** Begins recording a compute pass */
  beginComputePass(descriptor?: TgpuComputePassDescriptor): TgpuComputePass;

  /** Finishes the recording and submits the resulting command buffer to the device queue */
  submit(): void;

  /**
   * Escape hatch: finishes the recording without submitting, for manual
   * multi-encoder batching via `device.queue.submit([...])`.
   */
  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer;
}

export function INTERNAL_createCommandEncoder(
  root: ExperimentalTgpuRoot,
  descriptor?: GPUCommandEncoderDescriptor,
): TgpuCommandEncoder {
  return new TgpuCommandEncoderImpl(root, root.device.createCommandEncoder(descriptor), false);
}

export function INTERNAL_adoptCommandEncoder(
  root: ExperimentalTgpuRoot,
  rawEncoder: GPUCommandEncoder,
): TgpuCommandEncoder {
  return new TgpuCommandEncoderImpl(root, rawEncoder, true);
}

// --------------
// Implementation
// --------------

class TgpuCommandEncoderImpl implements TgpuCommandEncoder {
  readonly [$internal]: CommandEncoderInternals;
  readonly resourceType = 'command-encoder';

  constructor(root: ExperimentalTgpuRoot, rawEncoder: GPUCommandEncoder, adopted: boolean) {
    this[$internal] = {
      rawEncoder,
      root,
      adopted,
      beforeFinish: new Map(),
      afterSubmit: new Map(),
    };
  }

  beginRenderPass(descriptor: TgpuRenderPassDescriptor): TgpuRenderPass {
    return INTERNAL_beginRenderPass(this, descriptor);
  }

  beginComputePass(descriptor?: TgpuComputePassDescriptor): TgpuComputePass {
    return INTERNAL_beginComputePass(this, descriptor);
  }

  #recordPendingCommands(): void {
    const { rawEncoder, beforeFinish } = this[$internal];

    for (const record of beforeFinish.values()) {
      record(rawEncoder);
    }
    beforeFinish.clear();
  }

  submit(): void {
    const { rawEncoder, root, afterSubmit } = this[$internal];
    this.#recordPendingCommands();

    root.device.queue.submit([rawEncoder.finish()]);

    for (const hook of afterSubmit.values()) {
      hook();
    }
    afterSubmit.clear();
  }

  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer {
    const { rawEncoder, root, afterSubmit } = this[$internal];
    this.#recordPendingCommands();

    if (afterSubmit.size > 0) {
      logger.warnOnce(
        'suspicious',
        root,
        'finishWithPendingWork',
        'Shader console.log output and performance callbacks do not fire for command buffers produced by encoder.finish(). Use encoder.submit() instead.',
      );
    }

    return rawEncoder.finish(descriptor);
  }
}
