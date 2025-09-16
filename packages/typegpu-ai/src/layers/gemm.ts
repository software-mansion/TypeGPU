export interface GemmLayerSpec {
  weights: Float32Array;
  biases: Float32Array;
}

export function computeMaxBufferSize(specs: GemmLayerSpec[]): number {
  const maxOut = Math.max(...specs.map((l) => l.biases.length));
  const maxIn = Math.max(
    ...specs.map((l) => Math.floor(l.weights.length / l.biases.length)),
  );
  return Math.max(maxOut, maxIn);
}
