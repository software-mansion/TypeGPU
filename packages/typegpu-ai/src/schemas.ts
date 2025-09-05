import tgpu, {
  type StorageFlag,
  TgpuBindGroup,
  type TgpuBuffer,
  TgpuFn,
} from 'typegpu';
import * as d from 'typegpu/data';

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
});

export const weightsBiasesLayout = tgpu.bindGroupLayout({
  weights: ReadonlyFloats,
  biases: ReadonlyFloats,
});

export const activationFunctionSlot = tgpu.slot<TgpuFn>();

export interface DenseLayerGpu {
  inSize: number;
  outSize: number;
  weights: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  biases: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  ioBindGroup: TgpuBindGroup;
  wbBindGroup: TgpuBindGroup;
}

export interface NetworkRunner {
  run(input: number[] | Float32Array): Promise<number[]>;
  readonly layers: DenseLayerGpu[];
}
