import type { TgpuComputePass, TgpuComputePipeline } from 'typegpu';
import type { RunOptions } from './types.ts';

export type RunPass = GPUComputePassEncoder | TgpuComputePass;

export interface RunRecording {
  pass: RunPass;
  finish(): void;
}

export function bindPass(pipeline: TgpuComputePipeline, pass: RunPass): TgpuComputePipeline {
  if ('resourceType' in pass) {
    return pipeline.with(pass);
  }
  return pipeline.with(pass);
}

const noop = () => {};

export function beginRunPass(device: GPUDevice, options?: RunOptions): RunRecording {
  if (options?.pass) {
    return { pass: options.pass, finish: noop };
  }

  const externalEncoder = options?.encoder;
  if (externalEncoder) {
    const pass = externalEncoder.beginComputePass();
    return {
      pass,
      finish() {
        pass.end();
      },
    };
  }

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  return {
    pass,
    finish() {
      pass.end();
      device.queue.submit([encoder.finish()]);
    },
  };
}
