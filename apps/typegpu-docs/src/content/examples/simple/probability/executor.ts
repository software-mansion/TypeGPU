import tgpu from 'typegpu';
import type {
  StorageFlag,
  TgpuBindGroup,
  TgpuBindGroupLayout,
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
  #count!: number;
  #samplesBuffer!:
    & TgpuBuffer<d.WgslArray<d.Vec3f>>
    & StorageFlag;
  #seedBuffer!:
    & TgpuBuffer<d.WgslArray<d.F32>>
    & StorageFlag;
  readonly #dataMoreWorkersFunc: TgpuComputeFn;
  readonly #distributionSlot: TgpuSlot<TgpuFn<() => d.Vec3f>>;
  readonly #bindGroupLayout: TgpuBindGroupLayout;
  #bindGroup!: TgpuBindGroup;

  constructor(root: TgpuRoot) {
    this.#root = root;

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
    this.#samplesBuffer = this.#root
      .createBuffer(d.arrayOf(d.vec3f, value))
      .$usage('storage');
    this.#seedBuffer = this.#root
      .createBuffer(
        d.arrayOf(d.f32, value),
        Array.from({ length: value }, () => Math.random()),
      ).$usage('storage');

    this.#bindGroup = this.#root.createBindGroup(this.#bindGroupLayout, {
      seedBuffer: this.#seedBuffer,
      samplesBuffer: this.#samplesBuffer,
    });
  }

  get count() {
    return this.#count;
  }

  async executeMoreWorkers(
    distribution: TgpuFn<() => d.Vec3f>,
  ): Promise<d.v3f[]> {
    const pipeline = this.#root['~unstable']
      .with(this.#distributionSlot, distribution)
      .withCompute(this.#dataMoreWorkersFunc as TgpuComputeFn)
      .createPipeline();

    pipeline
      .with(this.#bindGroupLayout, this.#bindGroup)
      .dispatchWorkgroups(Math.ceil(this.#count / 64));
    this.#root['~unstable'].flush();

    return await this.#samplesBuffer.read();
  }
}
