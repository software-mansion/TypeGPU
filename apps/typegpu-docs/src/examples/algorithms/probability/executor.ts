import tgpu from 'typegpu';
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
import * as d from 'typegpu/data';
import {
  randf,
  randomGeneratorSlot,
  type StatefulGenerator,
} from '@typegpu/noise';

export class Executor {
  // don't exceed max workgroup grid X dimension size
  #count!: number;
  #samplesBuffer!:
    & TgpuBuffer<d.WgslArray<d.Vec3f>>
    & StorageFlag;
  #seedBuffer!:
    & TgpuBuffer<d.WgslArray<d.F32>>
    & StorageFlag;
  #bindGroup!: TgpuBindGroup;
  readonly #root: TgpuRoot;
  readonly #dataMoreWorkersFunc: TgpuComputeFn;
  readonly #distributionSlot: TgpuSlot<TgpuFn<() => d.Vec3f>>;
  readonly #bindGroupLayout: TgpuBindGroupLayout;
  readonly #bufferCache: Map<
    number,
    [
      & TgpuBuffer<d.WgslArray<d.Vec3f>>
      & StorageFlag,
      & TgpuBuffer<d.WgslArray<d.F32>>
      & StorageFlag,
    ]
  >;
  readonly #pipelineCache: WeakMap<
    TgpuFn,
    WeakMap<StatefulGenerator, TgpuComputePipeline>
  >;

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

    this.#dataMoreWorkersFunc = tgpu['~unstable'].computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [64],
    })((input) => {
      const id = input.gid.x;
      if (id >= bindGroupLayoutTempAlias.$.samplesBuffer.length) return;
      randf.seed(bindGroupLayoutTempAlias.$.seedBuffer[id]);
      bindGroupLayoutTempAlias.$.samplesBuffer[id] = distributionSlotTempAlias
        .$();
    });
  }

  reseed() {
    this.#seedBuffer.write(
      Array.from({ length: this.#count }, () => Math.random()),
    );
  }

  set count(value: number) {
    this.#count = value;
    const cacheEntry = this.#bufferCache.get(value);
    if (cacheEntry) {
      [this.#samplesBuffer, this.#seedBuffer] = cacheEntry;
    } else {
      this.#samplesBuffer = this.#root
        .createBuffer(d.arrayOf(d.vec3f, value))
        .$usage('storage');
      this.#seedBuffer = this.#root
        .createBuffer(
          d.arrayOf(d.f32, value),
          Array.from({ length: value }, () => Math.random()),
        ).$usage('storage');
      this.#bufferCache.set(value, [this.#samplesBuffer, this.#seedBuffer]);
    }

    this.#bindGroup = this.#root.createBindGroup(this.#bindGroupLayout, {
      seedBuffer: this.#seedBuffer,
      samplesBuffer: this.#samplesBuffer,
    });
  }

  #pipelineCacheHas(
    distribution: TgpuFn<() => d.Vec3f>,
    generator: StatefulGenerator,
  ): boolean {
    const generatorMap = this.#pipelineCache.get(distribution);
    if (!generatorMap) {
      return false;
    }

    return generatorMap.has(generator);
  }

  #pipelineCacheSet(
    distribution: TgpuFn<() => d.Vec3f>,
    generator: StatefulGenerator,
    pipeline: TgpuComputePipeline,
  ) {
    if (!this.#pipelineCache.has(distribution)) {
      this.#pipelineCache.set(distribution, new Map([[generator, pipeline]]));
      return;
    }

    // biome-ignore lint/style/noNonNullAssertion: just checked it above
    this.#pipelineCache.get(distribution)!.set(generator, pipeline);
  }

  pipelineCacheGet(
    distribution: TgpuFn<() => d.Vec3f>,
    generator: StatefulGenerator,
  ): TgpuComputePipeline {
    if (!this.#pipelineCacheHas(distribution, generator)) {
      const pipeline = this.#root['~unstable']
        .with(randomGeneratorSlot, generator)
        .with(this.#distributionSlot, distribution)
        .withCompute(this.#dataMoreWorkersFunc as TgpuComputeFn)
        .createPipeline();
      this.#pipelineCacheSet(distribution, generator, pipeline);
    }

    // biome-ignore lint/style/noNonNullAssertion: just checked it above
    return this.#pipelineCache.get(distribution)!.get(generator)!;
  }

  async executeMoreWorkers(
    distribution: TgpuFn<() => d.Vec3f>,
    generator: StatefulGenerator,
  ): Promise<d.v3f[]> {
    const pipeline = this.pipelineCacheGet(distribution, generator);

    pipeline
      .with(this.#bindGroupLayout, this.#bindGroup)
      .dispatchWorkgroups(Math.ceil(this.#count / 64));

    return await this.#samplesBuffer.read();
  }
}
