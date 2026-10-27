import type { TgpuComputePass, TgpuComputePipeline } from 'typegpu';
import type { RunOptions } from './types.ts';

export type RunPass = GPUComputePassEncoder | TgpuComputePass;

export interface RunRecording {
  pass: RunPass;
  finish(): void;
}

export interface DispatchStep {
  pipeline: TgpuComputePipeline;
  workgroups: [number, number, number];
}

export function bindPass(pipeline: TgpuComputePipeline, pass: RunPass): TgpuComputePipeline {
  return pipeline.with(pass as TgpuComputePass);
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

export function stepRunner(device: GPUDevice, steps: DispatchStep[]) {
  return {
    initSync(): void {
      for (const step of steps) {
        step.pipeline.initSync();
      }
    },

    async initAsync(): Promise<void> {
      await Promise.all(steps.map((step) => step.pipeline.initAsync()));
    },

    run(options?: RunOptions): void {
      const recording = beginRunPass(device, options);
      for (const step of steps) {
        bindPass(step.pipeline, recording.pass).dispatchWorkgroups(...step.workgroups);
      }
      recording.finish();
    },
  };
}
