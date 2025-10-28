import {
  type StorageFlag,
  TgpuBindGroup,
  type TgpuBuffer,
  TgpuComputePipeline,
  TgpuFn,
  type TgpuRoot,
  type UniformFlag,
} from 'typegpu';
import * as d from 'typegpu/data';
import { NNLayer } from '../gpuLayer';
import { type Tensor } from '../../onnx/types';
import { type Activation, type Layer, PipelineCache } from '../../pipelineCache';
import { GemmCompute } from './compute';
import {
  identity,
  relu,
  sigmoid,
  tanh,
} from '../activations/activationFunctions';
import { ioLayout, weightsBiasesLayout, workgroupSize } from '../../schemas';


export class LGemm implements NNLayer {
  public readonly inSize: number;
  public readonly outSize: number;
  public readonly activation: string | undefined;
  private readonly WeightsBiasesBindGroup: TgpuBindGroup;

  constructor(
    private readonly root: TgpuRoot,
    weightTensor: Tensor,
    biasTensor: Tensor,
    private readonly pipelineCache: PipelineCache,
    activation?: TgpuFn,
  ) {
    if (
      !weightTensor ||
      !biasTensor ||
      !(weightTensor.data instanceof Float32Array) ||
      !(biasTensor.data instanceof Float32Array) ||
      weightTensor.dims.length !== 2 ||
      biasTensor.dims.length !== 1
    ) { throw new Error("Invalid weight or bias tensor"); }

    const weightsData = weightTensor.data as Float32Array;
    const biasesData = biasTensor.data as Float32Array;

    if (biasesData.length === 0) {
      throw new Error("Bias tensor is empty");
    }
    if (weightsData.length % biasesData.length !== 0) {
      throw new Error("Weight tensor shape is incompatible with biases");
    }

    this.inSize = weightsData.length / biasesData.length;
    this.outSize = biasesData.length;


    this.WeightsBiasesBindGroup = root.createBindGroup(weightsBiasesLayout, {
      weights: root.createBuffer(
        d.arrayOf(d.f32, weightsData.length),
        Array.from(weightsData),
      ).$usage('storage'),
      biases: root.createBuffer(
        d.arrayOf(d.f32, biasesData.length),
        Array.from(biasesData),
      ).$usage('storage'),
    });
  }

  async run(
    input: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
    output: TgpuBuffer<d.WgslArray<d.F32>> & StorageFlag,
  ): Promise<void> {
    const ioBindGroup = this.root.createBindGroup(ioLayout, {
      input,
      output,
      inLength: this.root.createBuffer(d.u32, this.inSize).$usage('uniform'),
      outLength: this.root.createBuffer(d.u32, this.outSize).$usage('uniform'),
    });

    const pipeline = this.pipelineCache.get(
      { kind: 'Gemm', compute: GemmCompute },
      { kind: 'relu', fn: relu },
    );
    pipeline
      .with(ioLayout, ioBindGroup)
      .with(weightsBiasesLayout, this.WeightsBiasesBindGroup)
      .dispatchWorkgroups(Math.ceil(this.outSize / workgroupSize));

    await this.root.device.queue.onSubmittedWorkDone();
  }
}
