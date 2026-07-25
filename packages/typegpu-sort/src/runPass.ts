interface EncoderOptions {
  /** Records the dispatches as a single compute pass on this encoder. Nothing is submitted */
  encoder: GPUCommandEncoder;
  pass?: never;
}

interface ExternalPassOptions {
  encoder?: never;
  /** Records the dispatches into this pass. Nothing is submitted and the pass is not ended */
  pass: GPUComputePassEncoder;
}

/** Controls where a `run` call records its dispatches. Defaults to a standalone submit */
export type RunPassOptions = EncoderOptions | ExternalPassOptions;

export interface RunPassRecording {
  pass: GPUComputePassEncoder;
  finish(): void;
}

export function beginRunPass(device: GPUDevice, options?: RunPassOptions): RunPassRecording {
  if (options?.pass && options.encoder) {
    throw new Error('A run cannot record into both an encoder and an existing compute pass.');
  }

  const externalPass = options?.pass;
  if (externalPass) {
    return { pass: externalPass, finish() {} };
  }

  const encoder = options?.encoder ?? device.createCommandEncoder();
  const pass = encoder.beginComputePass();

  return {
    pass,
    finish() {
      pass.end();
      if (!options?.encoder) {
        device.queue.submit([encoder.finish()]);
      }
    },
  };
}
