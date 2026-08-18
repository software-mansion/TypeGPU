import { d, std, tgpu } from 'typegpu';
import type {
  StorageFlag,
  TgpuBindGroup,
  TgpuBuffer,
  TgpuComputePipeline,
  TgpuRoot,
  UniformFlag,
} from 'typegpu';

const WORKGROUP_SIZE = 256;
const ITEMS_PER_THREAD = 4;
const HISTOGRAM_SIZE = 256;
const MIN_INDEX = 0;
const MAX_INDEX = 1;
const COUNT_INDEX = 2;
const HISTOGRAM_OFFSET = 3;
const STATE_SIZE = HISTOGRAM_OFFSET + HISTOGRAM_SIZE;
const POSITIVE_INFINITY_BITS = 0x7f800000;
const FLOAT_ABSOLUTE_BITS = 0x7fffffff;
const FLOAT_SIGN_BIT = 0x80000000;
const UINT32_MAX = 0xffffffff;

const orderedFloatBits = (value: number) => {
  'use gpu';
  const bits = std.bitcast(d.f32, d.u32)(value);
  return (bits & FLOAT_SIGN_BIT) !== 0 ? bits ^ UINT32_MAX : bits ^ FLOAT_SIGN_BIT;
};

const floatFromOrderedBits = (ordered: number) => {
  'use gpu';
  const bits = (ordered & FLOAT_SIGN_BIT) !== 0 ? ordered ^ FLOAT_SIGN_BIT : ordered ^ UINT32_MAX;
  return std.bitcast(d.u32, d.f32)(bits);
};

const RangeParams = d.struct({
  pixelCount: d.u32,
});

const RangeState = d.arrayOf(d.atomic(d.u32), STATE_SIZE);

const rangeLayout = tgpu.bindGroupLayout({
  params: { uniform: RangeParams },
  disparity: { storage: d.arrayOf(d.vec4f), access: 'readonly' },
  state: { storage: RangeState, access: 'mutable' },
  range: { storage: d.vec2f, access: 'mutable' },
});

const reducedMinimum = tgpu.workgroupVar(d.arrayOf(d.u32, WORKGROUP_SIZE));
const reducedMaximum = tgpu.workgroupVar(d.arrayOf(d.u32, WORKGROUP_SIZE));
const reducedCount = tgpu.workgroupVar(d.arrayOf(d.u32, WORKGROUP_SIZE));
const localHistogram = tgpu.workgroupVar(d.arrayOf(d.atomic(d.u32), HISTOGRAM_SIZE));

export const resetRangeKernel = tgpu.computeFn({
  in: { lid: d.builtin.localInvocationIndex },
  workgroupSize: [WORKGROUP_SIZE],
})(({ lid }) => {
  'use gpu';
  std.atomicStore(rangeLayout.$.state[HISTOGRAM_OFFSET + lid], 0);
  if (lid === 0) {
    std.atomicStore(rangeLayout.$.state[MIN_INDEX], UINT32_MAX);
    std.atomicStore(rangeLayout.$.state[MAX_INDEX], 0);
    std.atomicStore(rangeLayout.$.state[COUNT_INDEX], 0);
  }
});

export const reduceRangeKernel = tgpu.computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationIndex,
  },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid, lid }) => {
  'use gpu';
  let minimum = d.u32(UINT32_MAX);
  let maximum = d.u32(0);
  let count = d.u32(0);
  const firstPixel = gid.x * ITEMS_PER_THREAD;

  for (const offset of tgpu.unroll(std.range(ITEMS_PER_THREAD))) {
    const pixel = firstPixel + d.u32(offset);
    if (pixel < rangeLayout.$.params.pixelCount) {
      const value = rangeLayout.$.disparity[pixel].x;
      const bits = std.bitcast(d.f32, d.u32)(value);
      if ((bits & FLOAT_ABSOLUTE_BITS) < POSITIVE_INFINITY_BITS) {
        const ordered = orderedFloatBits(value);
        minimum = std.min(minimum, ordered);
        maximum = std.max(maximum, ordered);
        count += 1;
      }
    }
  }

  reducedMinimum.$[lid] = minimum;
  reducedMaximum.$[lid] = maximum;
  reducedCount.$[lid] = count;
  std.workgroupBarrier();

  for (const stride of tgpu.unroll([128, 64, 32, 16, 8, 4, 2, 1])) {
    if (lid < stride) {
      reducedMinimum.$[lid] = std.min(reducedMinimum.$[lid], reducedMinimum.$[lid + stride]);
      reducedMaximum.$[lid] = std.max(reducedMaximum.$[lid], reducedMaximum.$[lid + stride]);
      reducedCount.$[lid] += reducedCount.$[lid + stride];
    }
    std.workgroupBarrier();
  }

  if (lid === 0 && reducedCount.$[0] > 0) {
    std.atomicMin(rangeLayout.$.state[MIN_INDEX], reducedMinimum.$[0]);
    std.atomicMax(rangeLayout.$.state[MAX_INDEX], reducedMaximum.$[0]);
    std.atomicAdd(rangeLayout.$.state[COUNT_INDEX], reducedCount.$[0]);
  }
});

export const histogramRangeKernel = tgpu.computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationIndex,
  },
  workgroupSize: [WORKGROUP_SIZE],
})(({ gid, lid }) => {
  'use gpu';
  std.atomicStore(localHistogram.$[lid], 0);
  std.workgroupBarrier();

  const minimumBits = std.atomicLoad(rangeLayout.$.state[MIN_INDEX]);
  const maximumBits = std.atomicLoad(rangeLayout.$.state[MAX_INDEX]);
  const minimum = floatFromOrderedBits(minimumBits);
  const maximum = floatFromOrderedBits(maximumBits);
  const span = maximum - minimum;
  const firstPixel = gid.x * ITEMS_PER_THREAD;

  for (const offset of tgpu.unroll(std.range(ITEMS_PER_THREAD))) {
    const pixel = firstPixel + d.u32(offset);
    if (pixel < rangeLayout.$.params.pixelCount) {
      const value = rangeLayout.$.disparity[pixel].x;
      const bits = std.bitcast(d.f32, d.u32)(value);
      if ((bits & FLOAT_ABSOLUTE_BITS) < POSITIVE_INFINITY_BITS) {
        let bin = d.u32(0);
        if (span > 0) {
          bin = d.u32(std.clamp(((value - minimum) / span) * HISTOGRAM_SIZE, 0, 255));
        }
        std.atomicAdd(localHistogram.$[bin], 1);
      }
    }
  }
  std.workgroupBarrier();

  const localCount = std.atomicLoad(localHistogram.$[lid]);
  if (localCount > 0) {
    std.atomicAdd(rangeLayout.$.state[HISTOGRAM_OFFSET + lid], localCount);
  }
});

export const finalizeRangeKernel = tgpu.computeFn({ workgroupSize: [1] })(() => {
  'use gpu';
  const count = std.atomicLoad(rangeLayout.$.state[COUNT_INDEX]);
  if (count === 0) {
    rangeLayout.$.range = d.vec2f(0, 1);
    return;
  }

  const minimum = floatFromOrderedBits(std.atomicLoad(rangeLayout.$.state[MIN_INDEX]));
  const maximum = floatFromOrderedBits(std.atomicLoad(rangeLayout.$.state[MAX_INDEX]));
  const span = maximum - minimum;
  if (span <= 0) {
    rangeLayout.$.range = d.vec2f(minimum, minimum + std.max(0.001, std.abs(minimum) * 0.001));
    return;
  }

  const lowTarget = std.max(d.u32(1), d.u32(d.f32(count) * 0.02));
  const highTarget = std.max(lowTarget, d.u32(d.f32(count) * 0.98));
  let cumulative = d.u32(0);
  let lowBin = d.u32(0);
  let highBin = d.u32(HISTOGRAM_SIZE - 1);
  let foundLow = false;
  let foundHigh = false;

  for (let bin = d.u32(0); bin < HISTOGRAM_SIZE; bin += 1) {
    cumulative += std.atomicLoad(rangeLayout.$.state[HISTOGRAM_OFFSET + bin]);
    if (!foundLow && cumulative >= lowTarget) {
      lowBin = bin;
      foundLow = true;
    }
    if (!foundHigh && cumulative >= highTarget) {
      highBin = bin;
      foundHigh = true;
    }
  }

  const low = minimum + (d.f32(lowBin) / HISTOGRAM_SIZE) * span;
  const high = minimum + (d.f32(highBin + 1) / HISTOGRAM_SIZE) * span;
  rangeLayout.$.range = d.vec2f(low, std.max(high, low + 0.001));
});

type DisparityBuffer = TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;
type RangeBuffer = TgpuBuffer<d.Vec2f> & StorageFlag;

export class DepthDisparityRangeEstimator {
  readonly #root: TgpuRoot;
  readonly #params: TgpuBuffer<typeof RangeParams> & UniformFlag;
  readonly #state: TgpuBuffer<typeof RangeState> & StorageFlag;
  readonly #pipelines: readonly TgpuComputePipeline[];
  #bindGroup: TgpuBindGroup<typeof rangeLayout.entries> | undefined;
  #workgroups = 1;
  #destroyed = false;

  constructor(root: TgpuRoot) {
    this.#root = root;
    this.#params = root.createBuffer(RangeParams, { pixelCount: 1 }).$usage('uniform');
    this.#state = root
      .createBuffer(
        RangeState,
        Array.from({ length: STATE_SIZE }, () => 0),
      )
      .$usage('storage');
    this.#pipelines = [
      root.createComputePipeline({ compute: resetRangeKernel }).$name('Reset disparity range'),
      root.createComputePipeline({ compute: reduceRangeKernel }).$name('Reduce disparity range'),
      root
        .createComputePipeline({ compute: histogramRangeKernel })
        .$name('Histogram disparity range'),
      root
        .createComputePipeline({ compute: finalizeRangeKernel })
        .$name('Finalize disparity range'),
    ];
  }

  async initAsync(): Promise<void> {
    this.#assertAlive();
    await Promise.all(this.#pipelines.map((pipeline) => pipeline.initAsync()));
  }

  attach(disparity: DisparityBuffer, range: RangeBuffer, pixelCount: number): void {
    this.#assertAlive();
    this.#params.write({ pixelCount });
    this.#workgroups = Math.ceil(pixelCount / (WORKGROUP_SIZE * ITEMS_PER_THREAD));
    this.#bindGroup = this.#root.createBindGroup(rangeLayout, {
      params: this.#params,
      disparity,
      state: this.#state,
      range,
    });
  }

  detach(): void {
    this.#bindGroup = undefined;
  }

  encode(encoder: GPUCommandEncoder): void {
    this.#assertAlive();
    if (!this.#bindGroup) {
      throw new Error('No disparity output buffer is attached to the range estimator.');
    }
    const pass = encoder.beginComputePass({ label: 'DepthART GPU percentile range' });
    this.#pipelines[0]?.with(pass).with(this.#bindGroup).dispatchWorkgroups(1);
    this.#pipelines[1]?.with(pass).with(this.#bindGroup).dispatchWorkgroups(this.#workgroups);
    this.#pipelines[2]?.with(pass).with(this.#bindGroup).dispatchWorkgroups(this.#workgroups);
    this.#pipelines[3]?.with(pass).with(this.#bindGroup).dispatchWorkgroups(1);
    pass.end();
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.detach();
    this.#params.destroy();
    this.#state.destroy();
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('The disparity range estimator has been destroyed.');
    }
  }
}
