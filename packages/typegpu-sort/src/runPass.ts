/**
 * Controls where a `run` call records its dispatches.
 */
interface EncoderOptions {
  /**
   * Record the dispatches into an existing command encoder (as a single compute
   * pass). Nothing is submitted — the caller owns the encoder.
   */
  encoder: GPUCommandEncoder;
  pass?: never;
}

interface ExternalPassOptions {
  encoder?: never;
  /**
   * Record the dispatches into an already-begun compute pass. Nothing is
   * submitted and the pass is not ended — the caller owns the pass.
   */
  pass: GPUComputePassEncoder;
}

export type RunPassOptions = EncoderOptions | ExternalPassOptions;

export interface RunPassRecording {
  pass: GPUComputePassEncoder;
  finish(): void;
}

/**
 * Resolves the compute pass that a `run` call should record into. All dispatches
 * of a run land in a single compute pass — standalone runs get their own encoder
 * and a single queue submit, encoder runs get one pass on the caller's encoder,
 * and pass runs record straight into the caller's pass.
 */
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
