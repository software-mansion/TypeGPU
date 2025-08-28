import tgpu from 'typegpu';
import type {
  StorageFlag,
  TgpuBuffer,
  TgpuComputeFn,
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
  readonly #root: TgpuRoot;
  // don't exceed max workgroup grid X dimension size
  #count: number;
  #samplesBuffer:
    & TgpuBuffer<d.WgslArray<d.Vec3f>>
    & StorageFlag;
  #seedBuffer:
    & TgpuBuffer<d.WgslArray<d.F32>>
    & StorageFlag;
  readonly #dataMoreWorkersFunc: TgpuComputeFn;
  readonly #distributionSlot: TgpuSlot<TgpuFn<() => d.Vec3f>>;
  readonly #sampleBufferSlot;
  readonly #seedBufferSlot;

  constructor(root: TgpuRoot, count: number) {
    console.assert(
      count > 0,
      'Count cannot be 0. Cannot create buffer of size 0',
    );
    console.assert(
      count <= 65536,
      'Count cannot exceed max workgroup grid X dimension size',
    );

    this.#root = root;
    this.#count = count;
    this.#samplesBuffer = this.#root.createBuffer(d.arrayOf(d.vec3f, count))
      .$usage(
        'storage',
      );
    this.#seedBuffer = this.#root.createBuffer(
      d.arrayOf(d.f32, count),
      Array.from({ length: count }, () => Math.random()),
    )
      .$usage(
        'storage',
      );

    const sampleBufferSlotTempAlias = tgpu.slot(
      this.#samplesBuffer.as('mutable'),
    );
    const distributionSlotTempAlias = tgpu.slot<TgpuFn<() => d.Vec3f>>();
    const seedBufferSlotTempAlias = tgpu.slot(
      this.#seedBuffer.as('mutable'),
    );

    this.#sampleBufferSlot = sampleBufferSlotTempAlias;
    this.#distributionSlot = distributionSlotTempAlias;
    this.#seedBufferSlot = seedBufferSlotTempAlias;

    this.#dataMoreWorkersFunc = tgpu['~unstable'].computeFn({
      in: { gid: d.builtin.globalInvocationId, count: d.builtin.numWorkgroups },
      workgroupSize: [1],
    })((input) => {
      const gid = input.gid;
      randf.seed(seedBufferSlotTempAlias.$[gid.x]);
      sampleBufferSlotTempAlias.$[gid.x] = distributionSlotTempAlias.$();
    });
  }

  set count(value: number) {
    this.#count = value;
    this.#samplesBuffer = this.#root.createBuffer(d.arrayOf(d.vec3f, value))
      .$usage(
        'storage',
      );

    this.#seedBuffer = this.#root.createBuffer(
      d.arrayOf(d.f32, value),
      Array.from({ length: value }, () => Math.random()),
    ).$usage('storage');
  }

  get count() {
    return this.#count;
  }

  async executeMoreWorkers(
    distribution: TgpuFn<() => d.Vec3f>,
    generator: StatefulGenerator,
  ): Promise<d.v3f[]> {
    const pipeline = this.#root['~unstable']
      .with(randomGeneratorSlot, generator)
      .with(this.#sampleBufferSlot, this.#samplesBuffer.as('mutable'))
      .with(this.#seedBufferSlot, this.#seedBuffer.as('mutable'))
      .with(this.#distributionSlot, distribution)
      .withCompute(this.#dataMoreWorkersFunc as TgpuComputeFn)
      .createPipeline();

    pipeline.dispatchWorkgroups(this.#count);

    return await this.#samplesBuffer.read();
  }
}
