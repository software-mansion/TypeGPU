import type { TgpuQuerySet } from 'typegpu';

/**
 * Controls where a `run` call records its dispatches.
 */
export interface RunPassOptions {
  /**
   * Timestamp query set (size >= 2) for GPU timing. The whole run is recorded
   * into a single compute pass — timestamp 0 is written at its beginning and
   * timestamp 1 at its end. Cannot be combined with `pass` (timestamps are a
   * per-pass setting).
   */
  querySet?: TgpuQuerySet<'timestamp'>;
  /**
   * Record the dispatches into an existing command encoder (as a single compute
   * pass). Nothing is submitted — the caller owns the encoder.
   */
  encoder?: GPUCommandEncoder;
  /**
   * Record the dispatches into an already-begun compute pass. Nothing is
   * submitted and the pass is not ended — the caller owns the pass.
   */
  pass?: GPUComputePassEncoder;
}

export interface RunPassRecording {
  pass: GPUComputePassEncoder;
  finish(): void;
}

/**
 * Resolves the compute pass that a `run` call should record into. All dispatches
 * of a run land in a single compute pass — standalone runs get their own encoder
 * and a single queue submit, encoder runs get one pass on the caller's encoder,
 * and pass runs record straight into the caller's pass. Timestamps (when a
 * querySet is given) wrap the whole pass via pass-level `timestampWrites`.
 */
export function beginRunPass(device: GPUDevice, options?: RunPassOptions): RunPassRecording {
  const querySet = options?.querySet;
  if (querySet && options?.pass) {
    throw new Error(
      'A timestamp querySet cannot be used when recording into an existing compute pass.',
    );
  }

  const externalPass = options?.pass;
  if (externalPass) {
    return { pass: externalPass, finish() {} };
  }

  const encoder = options?.encoder ?? device.createCommandEncoder();
  const pass = encoder.beginComputePass(
    querySet
      ? {
          timestampWrites: {
            querySet: querySet.querySet,
            beginningOfPassWriteIndex: 0,
            endOfPassWriteIndex: 1,
          },
        }
      : {},
  );

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
