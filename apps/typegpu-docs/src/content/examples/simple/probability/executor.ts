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
  // max count 65000 for convenience
  #count: number;
  #sampleBuffer:
    & TgpuBuffer<d.WgslArray<d.Vec3f>>
    & StorageFlag;
  readonly #dataSingleWorkerFunc: TgpuComputeFn;
  readonly #dataMoreWorkersFunc: TgpuComputeFn;
  readonly #distributionSlot: TgpuSlot<TgpuFn<() => d.Vec3f>>;
  // inaccessible type
  readonly #sampleBufferSlot;

  constructor(root: TgpuRoot, count: number) {
    this.#root = root;
    this.#count = count;
    this.#sampleBuffer = this.#root.createBuffer(d.arrayOf(d.vec3f, count))
      .$usage(
        'storage',
      );
    const sampleBufferSlotTempAlias = tgpu.slot(
      this.#sampleBuffer.as('mutable'),
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
    this.#sampleBuffer = this.#root.createBuffer(d.arrayOf(d.vec3f, value))
      .$usage(
        'storage',
      );
  }

  async executeSingleWorker(
    distribution: TgpuFn<() => d.Vec3f>,
  ): Promise<d.v3f[]> {
    const pipeline = this.#root['~unstable']
      .with(this.#sampleBufferSlot, this.#sampleBuffer.as('mutable'))
      .with(this.#distributionSlot, distribution)
      .withCompute(this.#dataSingleWorkerFunc as TgpuComputeFn)
      .createPipeline();

    pipeline.dispatchWorkgroups(1);

    return await this.#sampleBuffer.read();
  }

  async executeMoreWorkers(
    distribution: TgpuFn<() => d.Vec3f>,
  ): Promise<d.v3f[]> {
    const pipeline = this.#root['~unstable']
      .with(this.#sampleBufferSlot, this.#sampleBuffer.as('mutable'))
      .with(this.#distributionSlot, distribution)
      .withCompute(this.#dataMoreWorkersFunc as TgpuComputeFn)
      .createPipeline();

    pipeline.dispatchWorkgroups(this.#count);

    return await this.#sampleBuffer.read();
  }
}
