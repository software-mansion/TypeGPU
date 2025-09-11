// Centralized helpers for validating layer sizes and reporting mismatches.

export interface LayerSizeInfo {
  inSize: number;
  outSize: number;
}

/**
 * Validate sizes for a dense layer given flat weight and bias buffers.
 * - weights length must equal inSize * outSize
 * - if prevOut is provided, it must match the current inSize
 * Returns computed { inSize, outSize } or throws with a descriptive message.
 */
export function validateLayerSizes(
  weights: Float32Array,
  biases: Float32Array,
  layerIndex: number,
  prevOut: number | null,
): LayerSizeInfo {
  const outSize = biases.length;
  const inSize = weights.length / outSize;

  if (!Number.isInteger(inSize)) {
    throw new Error(
      `Layer ${layerIndex} weight length mismatch: got ${weights.length} vs ${inSize}*${outSize}`,
    );
  }

  if (prevOut !== null && inSize !== prevOut) {
    throw new Error(
      `Layer ${layerIndex} input size ${inSize} != previous output size ${prevOut}`,
    );
  }

  return { inSize, outSize };
}
