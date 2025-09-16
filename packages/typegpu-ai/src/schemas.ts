import tgpu, {
  type StorageFlag,
  TgpuBindGroup,
  type TgpuBuffer,
  TgpuComputeFn,
  TgpuFn,
} from 'typegpu';
import * as d from 'typegpu/data';
import { type Activation, Layer } from './pipelineCache';

export const calculateIndex = tgpu.fn([d.vec3u, d.vec3u], d.u32)((id, nwg) =>
  id.x + id.y * nwg.x + id.z * nwg.x * nwg.y
);
export const workgroupSize = 64;

const ReadonlyFloats = {
  storage: d.arrayOf(d.f32),
  access: 'readonly',
} as const;

const MutableFloats = {
  storage: d.arrayOf(d.f32),
  access: 'mutable',
} as const;

export const ioLayout = tgpu.bindGroupLayout({
  input: ReadonlyFloats,
  output: MutableFloats,
  inLength: { uniform: d.u32 }, // per dispatch
  outLength: { uniform: d.u32 },
});

export const weightsBiasesLayout = tgpu.bindGroupLayout({
  weights: ReadonlyFloats,
  biases: ReadonlyFloats,
});

export const activationFunctionSlot = tgpu.slot<TgpuFn>();

// Generic GPU layer representation (will expand with Conv, etc.)
export type GpuLayer =
  | {
    kind: 'Gemm';
    inSize: number;
    outSize: number;
    weights: Float32Array<ArrayBufferLike>;
    biases: Float32Array<ArrayBufferLike>;
    io: TgpuBindGroup; // input/output buffers + sizes
    params: TgpuBindGroup; // weights + biases
    compute: TgpuComputeFn; // compute function descriptor (for pipeline cache)
    activation: Activation; // activation to apply (identity for final layer)
  }
  | {
    kind: 'Conv';
    inSize: number;
    outSize: number;
    // Example fields (to be fleshed out when Conv implemented):
    // inChannels: number;
    // outChannels: number;
    // kernelSize: [number, number];
    // stride: [number, number];
    // padding: [number, number];
    // weights: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
    // biases: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
    descriptor: Layer;
    activation: Activation;
  };

export interface NetworkRunner {
  run(input: number[] | Float32Array): Promise<number[]>;
}
