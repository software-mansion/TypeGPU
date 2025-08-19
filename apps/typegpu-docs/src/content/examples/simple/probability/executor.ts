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
import { randf } from '@typegpu/noise';

export class Executor {
  readonly #root: TgpuRoot;
  // don't exceed max workgroup grid X dimension size
  #count: number;
  #maxCount: number;
  #samplesBuffer:
    & TgpuBuffer<d.WgslArray<d.Vec3f>>
    & StorageFlag;
  #samples: d.v3f[];
  readonly #dataSingleWorkerFunc: TgpuComputeFn;
  readonly #dataMoreWorkersFunc: TgpuComputeFn;
  readonly #distributionSlot: TgpuSlot<TgpuFn<() => d.Vec3f>>;
  readonly #sampleBufferSlot;

  constructor(root: TgpuRoot, count: number) {
    console.assert(
      count > 0,
      'Count cannot be 0. Cannot create buffer of size 0',
    );
    this.#root = root;
    this.#count = count;
    this.#maxCount = count;
    this.#samplesBuffer = this.#root.createBuffer(d.arrayOf(d.vec3f, count))
      .$usage(
        'storage',
      );
    this.#samples = [];

    const sampleBufferSlotTempAlias = tgpu.slot(
      this.#samplesBuffer.as('mutable'),
    );
    const distributionSlotTempAlias = tgpu.slot<TgpuFn<() => d.Vec3f>>();

    this.#sampleBufferSlot = sampleBufferSlotTempAlias;
    this.#distributionSlot = distributionSlotTempAlias;

    this.#dataSingleWorkerFunc = tgpu['~unstable'].computeFn({
      workgroupSize: [1],
    })(() => {
      for (let i = 0; i < sampleBufferSlotTempAlias.$.length; i++) {
        sampleBufferSlotTempAlias.$[i] = distributionSlotTempAlias.$();
      }
    });

    this.#dataMoreWorkersFunc = tgpu['~unstable'].computeFn({
      in: { gid: d.builtin.globalInvocationId },
      workgroupSize: [1],
    })((input) => {
      const gid = input.gid;
      randf.seed(d.f32(gid.x));
      sampleBufferSlotTempAlias.$[gid.x] = distributionSlotTempAlias.$();
    });
  }

  set count(value: number) {
    this.#count = value;

    if (value <= this.#maxCount) {
      return;
    }

    this.#maxCount = value;
    this.#samplesBuffer = this.#root.createBuffer(d.arrayOf(d.vec3f, value))
      .$usage(
        'storage',
      );
    this.#samples = [];
  }

  get count() {
    return this.#count;
  }

  async executeSingleWorker(
    distribution: TgpuFn<() => d.Vec3f>,
    forceReExec = false,
  ): Promise<d.v3f[]> {
    if (this.#samples.length !== 0 && !forceReExec) {
      return this.#samples.slice(0, this.#count);
    }

    const pipeline = this.#root['~unstable']
      .with(this.#sampleBufferSlot, this.#samplesBuffer.as('mutable'))
      .with(this.#distributionSlot, distribution)
      .withCompute(this.#dataSingleWorkerFunc as TgpuComputeFn)
      .createPipeline();

    pipeline.dispatchWorkgroups(1);

    this.#samples = await this.#samplesBuffer.read();
    return this.#samples;
  }

  async executeMoreWorkers(
    distribution: TgpuFn<() => d.Vec3f>,
    forceReExec = false,
  ): Promise<d.v3f[]> {
    if (this.#samples.length !== 0 && !forceReExec) {
      return this.#samples.slice(0, this.#count);
    }

    const pipeline = this.#root['~unstable']
      .with(this.#sampleBufferSlot, this.#samplesBuffer.as('mutable'))
      .with(this.#distributionSlot, distribution)
      .withCompute(this.#dataMoreWorkersFunc as TgpuComputeFn)
      .createPipeline();

    pipeline.dispatchWorkgroups(this.#count);

    this.#samples = await this.#samplesBuffer.read();
    return this.#samples;
  }
}
