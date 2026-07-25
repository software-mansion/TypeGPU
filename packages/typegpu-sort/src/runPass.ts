import type { RunOptions } from './types.ts';

export interface RunRecording {
  pass: GPUComputePassEncoder;
  finish(): void;
}

const noop = () => {};

export function beginRunPass(device: GPUDevice, options?: RunOptions): RunRecording {
  if (options?.pass) {
    return { pass: options.pass, finish: noop };
  }

  const externalEncoder = options?.encoder;
  const encoder = externalEncoder ?? device.createCommandEncoder();
  const pass = encoder.beginComputePass();

  return {
    pass,
    finish() {
      pass.end();
      if (!externalEncoder) {
        device.queue.submit([encoder.finish()]);
      }
    },
  };
}
