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

// Convolution parameters layout:
// weights are laid out as: [outChannels][inChannels][kH][kW]
// biases: [outChannels]
// dims buffer: stores packed u32 values for shape/stride/padding and output dims
export const convWeightsLayout = tgpu.bindGroupLayout({
  weights: ReadonlyFloats,
  biases: ReadonlyFloats,
  // dims: [inC, outC, inH, inW, kH, kW, strideH, strideW, padH, padW, outH, outW]
  dims: {
    storage: d.arrayOf(d.u32),
    access: 'readonly',
  },
});

export const activationFunctionSlot = tgpu.slot<TgpuFn>();

export const maxPoolParamsLayout = tgpu.bindGroupLayout({
  dims: {
    storage: d.arrayOf(d.u32),
    access: 'readonly',
  },
});

export const resizeParamsLayout = tgpu.bindGroupLayout({
  scales: {
    storage: d.arrayOf(d.f32),
    access: 'readonly',
  },
  dims: {
    storage: d.arrayOf(d.u32),
    access: 'readonly',
  },
});

export const clipParamsLayout = tgpu.bindGroupLayout({
  bounds: {
    storage: d.arrayOf(d.f32),
    access: 'readonly',
  },
});

export const addParamsLayout = tgpu.bindGroupLayout({
  // For now, assuming adding a constant bias vector or similar
  other: {
    storage: d.arrayOf(d.f32),
    access: 'readonly',
  },
});

export const concatParamsLayout = tgpu.bindGroupLayout({
  offset: { uniform: d.u32 },
});

export const shapeParamsLayout = tgpu.bindGroupLayout({
  dims: {
    storage: d.arrayOf(d.f32), // Outputting shape as floats for compatibility
    access: 'readonly',
  },
});

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
    inSize: number; // flattened in (C_in * H * W)
    outSize: number; // flattened out (C_out * H_out * W_out)
    weights: Float32Array<ArrayBufferLike>;
    biases: Float32Array<ArrayBufferLike>;
    dims: {
      inChannels: number;
      outChannels: number;
      inH: number;
      inW: number;
      kH: number;
      kW: number;
      strideH: number;
      strideW: number;
      padH: number;
      padW: number;
      outH: number;
      outW: number;
    };
    io: TgpuBindGroup; // shares same layout as dense (ioLayout)
    params: TgpuBindGroup; // conv-specific params + weights/biases
    compute: TgpuComputeFn;
    activation: Activation;
  }
  | {
    kind: 'MaxPool';
    inSize: number;
    outSize: number;
    dims: {
      channels: number;
      inH: number;
      inW: number;
      kH: number;
      kW: number;
      strideH: number;
      strideW: number;
      padH: number;
      padW: number;
      outH: number;
      outW: number;
    };
    io: TgpuBindGroup;
    params: TgpuBindGroup;
    compute: TgpuComputeFn;
  }
  | {
    kind: 'Flatten';
    inSize: number;
    outSize: number;
    io: TgpuBindGroup;
    compute: TgpuComputeFn;
  }
  | {
    kind: 'Resize';
    inSize: number;
    outSize: number;
    io: TgpuBindGroup;
    params: TgpuBindGroup;
    compute: TgpuComputeFn;
  }
  | {
    kind: 'Concat';
    outSize: number;
    io: TgpuBindGroup;
    params: TgpuBindGroup;
    compute: TgpuComputeFn;
  }
  | {
    kind: 'Add';
    inSize: number;
    outSize: number;
    io: TgpuBindGroup;
    compute: TgpuComputeFn;
  }
  | {
    kind: 'Clip';
    inSize: number;
    outSize: number;
    io: TgpuBindGroup;
    params: TgpuBindGroup;
    compute: TgpuComputeFn;
  }
  | {
    kind: 'Shape';
    outSize: number;
    io: TgpuBindGroup;
    params: TgpuBindGroup;
    compute: TgpuComputeFn;
  }
  | {
    kind: 'ConvTranspose';
    inSize: number;
    outSize: number;
    weights: Float32Array<ArrayBufferLike>;
    biases: Float32Array<ArrayBufferLike>;
    dims: {
      inChannels: number;
      outChannels: number;
      inH: number;
      inW: number;
      kH: number;
      kW: number;
      strideH: number;
      strideW: number;
      padH: number;
      padW: number;
      outH: number;
      outW: number;
    };
    io: TgpuBindGroup;
    params: TgpuBindGroup;
    compute: TgpuComputeFn;
    activation: Activation;
  };

export interface NetworkRunner {
  run(
    input: number[] | Float32Array | (TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag),
    output?: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  ): Promise<number[] | void>;
}
