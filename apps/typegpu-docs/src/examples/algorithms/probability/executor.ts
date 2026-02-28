import { randf } from '@typegpu/noise';
import type {
  StorageFlag,
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuBuffer,
  TgpuComputeFn,
  TgpuComputePipeline,
  TgpuFn,
  TgpuRoot,
  TgpuSlot,
} from 'typegpu';
import tgpu, { d } from 'typegpu';

export class Executor {
  // don't exceed max workgroup grid X dimension size
  #count!: number;
  #samplesBuffer!: TgpuBuffer<d.WgslArray<d.Vec3f>> & StorageFlag;
  #seedBuffer!: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag;
  #bindGroup!: TgpuBindGroup;
  readonly #root: TgpuRoot;
  readonly #dataMoreWorkersFunc: TgpuComputeFn;
  readonly #distributionSlot: TgpuSlot<TgpuFn<() => d.Vec3f>>;
  readonly #bindGroupLayout: TgpuBindGroupLayout;
  readonly #bufferCache: Map<
    number,
    [TgpuBuffer<d.WgslArray<d.Vec3f>> & StorageFlag, TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag]
  >;
  readonly #pipelineCache: Map<TgpuFn, TgpuComputePipeline>;

  constructor(root: TgpuRoot) {
    this.#root = root;
    this.#bufferCache = new Map();
    this.#pipelineCache = new Map();

    const distributionSlotTempAlias = tgpu.slot<TgpuFn<() => d.Vec3f>>();
    this.#distributionSlot = distributionSlotTempAlias;

    const bindGroupLayoutTempAlias = tgpu.bindGroupLayout({
      seedBuffer: { storage: d.arrayOf(d.f32), access: 'readonly' },
      samplesBuffer: { storage: d.arrayOf(d.vec3f), access: 'mutable' },
    });
    this.#bindGroupLayout = bindGroupLayoutTempAlias;

    this.#dataMoreWorkersFunc = tgpu.computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [64],
    })((input) => {
      const id = input.gid.x;
      if (id >= bindGroupLayoutTempAlias.$.samplesBuffer.length) return;
      randf.seed(bindGroupLayoutTempAlias.$.seedBuffer[id]);
      bindGroupLayoutTempAlias.$.samplesBuffer[id] = distributionSlotTempAlias.$();
    });
  }

  reseed() {
    this.#seedBuffer.write(Array.from({ length: this.#count }, () => Math.random()));
  }

  set count(value: number) {
    this.#count = value;
    const cacheEntry = this.#bufferCache.get(value);
    if (cacheEntry) {
      [this.#samplesBuffer, this.#seedBuffer] = cacheEntry;
    } else {
      this.#samplesBuffer = this.#root.createBuffer(d.arrayOf(d.vec3f, value)).$usage('storage');
      this.#seedBuffer = this.#root
        .createBuffer(
          d.arrayOf(d.f32, value),
          Array.from({ length: value }, () => Math.random()),
        )
        .$usage('storage');
      this.#bufferCache.set(value, [this.#samplesBuffer, this.#seedBuffer]);
    }

    this.#bindGroup = this.#root.createBindGroup(this.#bindGroupLayout, {
      seedBuffer: this.#seedBuffer,
      samplesBuffer: this.#samplesBuffer,
    });
  }

  cachedPipeline(distribution: TgpuFn<() => d.Vec3f>) {
    if (!import.meta.env.DEV) {
      throw new Error('Function only for testing purposes');
    }

    if (!this.#pipelineCache.has(distribution)) {
      const pipeline = this.#root
        .with(this.#distributionSlot, distribution)
        .createComputePipeline({ compute: this.#dataMoreWorkersFunc });
      this.#pipelineCache.set(distribution, pipeline);
    }

    // oxlint-disable-next-line typescript/no-non-null-assertion -- just checked it above
    return this.#pipelineCache.get(distribution)!;
  }

  async executeMoreWorkers(distribution: TgpuFn<() => d.Vec3f>): Promise<d.v3f[]> {
    let pipeline = this.#pipelineCache.get(distribution);
    if (!pipeline) {
      pipeline = this.#root
        .with(this.#distributionSlot, distribution)
        .createComputePipeline({ compute: this.#dataMoreWorkersFunc });
      this.#pipelineCache.set(distribution, pipeline);
    }

    pipeline.with(this.#bindGroup).dispatchWorkgroups(Math.ceil(this.#count / 64));

    return await this.#samplesBuffer.read();
  }
}
