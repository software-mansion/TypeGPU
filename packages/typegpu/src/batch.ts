/**
 * This state is used to determine if we should submit command buffer to the device queue.
 * It is shared across all roots.
 */
export const BatchFlag = {
  insideBatch: false,
};

/**
 * Executes a batch of GPU computations.
 *
 * Commands inside `callback` are stored in a single command buffer,
 * then submitted to the device queue at once.
 *
 * There is one exception, pipelines with
 * performance callbacks/timestamp writes are flushed immediately.
 *
 * @param callback A function with GPU computations to be batched.
 */
export function batch(callback: () => void): void {
  BatchFlag.insideBatch = true;
  try {
    callback();
  } finally {
    BatchFlag.insideBatch = false;
  }
}
