import type { TgpuQuerySet, TgpuRoot } from 'typegpu';

type MinimalNetwork = {
  // should match the lightweight Network used in the examples
  inference: (data: number[] | Float32Array) => Promise<number[]>;
  // optional helpful hint about input size
  inputSize?: number;
};

/**
 * Minimal wrapper around a neural network object providing an inference() method.
 *
 * This intentionally keeps things tiny: it validates the provided object and
 * returns a runner with a simple `run` helper that calls the underlying
 * `inference` method. Timestamp callbacks are ignored for now to stay simple.
 */
export function modelInference(
  root: TgpuRoot,
  neuralNetwork: MinimalNetwork,
  timeCallback?: (timeTgpuQuery: TgpuQuerySet<'timestamp'>) => void,
): {
  run: (data: number[] | Float32Array) => Promise<number[]>;
  dispose: () => void;
} {
  if (!neuralNetwork || typeof neuralNetwork.inference !== 'function') {
    throw new Error(
      'modelInference: `neuralNetwork` must be an object with an `inference(data)` async method',
    );
  }

  // Minimal runner that forwards to the provided inference implementation.
  const runner = {
    run: async (data: number[] | Float32Array) => {
      // Basic validation: if inputSize is provided, check length
      if (
        neuralNetwork.inputSize && Array.isArray(data) &&
        data.length !== neuralNetwork.inputSize
      ) {
        throw new Error(
          `modelInference: input length ${data.length} does not match expected inputSize ${neuralNetwork.inputSize}`,
        );
      }

      // Forward the call. Keep timing simple — we don't orchestrate GPU timestamp queries here.
      const result = await neuralNetwork.inference(
        Array.isArray(data) ? data : Array.from(data),
      );
      return result;
    },
    dispose: () => {
      // No-op for the minimal implementation. If the wrapped network exposes
      // a dispose() / destroy() API in the future we can call it here.
    },
  };

  return runner;
}
