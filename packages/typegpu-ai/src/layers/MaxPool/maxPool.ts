import {
  type StorageFlag,
  TgpuBindGroup,
  type TgpuBuffer,
  type TgpuRoot,
} from 'typegpu';
import * as d from 'typegpu/data';
import { NNLayer } from '../gpuLayer';
import { PipelineCache } from '../../pipelineCache.ts';
import { maxPoolCompute } from './compute.ts';
import { ioLayout, maxPoolParamsLayout, workgroupSize } from '../../schemas.ts';
import { identity } from '../activations/activationFunctions.ts';

export interface MaxPoolDimensions {
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
}

export class LMaxPool implements NNLayer {
  public readonly inSize: number;
  public readonly outSize: number;
  // MaxPool doesn't usually have activation, but keeping it for consistency if needed later
  public readonly activation = 'identity';

  private readonly paramsBindGroup: TgpuBindGroup;

  constructor(
    private readonly root: TgpuRoot,
    private readonly pipelineCache: PipelineCache,
    dims: MaxPoolDimensions,
  ) {
    this.inSize = dims.channels * dims.inH * dims.inW;
    this.outSize = dims.channels * dims.outH * dims.outW;

    const dimsArray = [
      dims.channels,
      dims.inH,
      dims.inW,
      dims.kH,
      dims.kW,
      dims.strideH,
      dims.strideW,
      dims.padH,
      dims.padW,
      dims.outH,
      dims.outW,
    ];

    const dimsBuffer = this.root.createBuffer(
      d.arrayOf(d.u32, dimsArray.length),
      dimsArray,
    ).$usage('storage');

    this.paramsBindGroup = this.root.createBindGroup(maxPoolParamsLayout, {
      dims: dimsBuffer,
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

    // MaxPool doesn't use the activation slot, but we pass identity to satisfy the cache key
    const pipeline = this.pipelineCache.get({
      kind: 'MaxPool',
      compute: maxPoolCompute,
    }, { kind: 'identity', fn: identity });

    pipeline
      .with(ioBindGroup)
      .with(this.paramsBindGroup)
      .dispatchWorkgroups(Math.ceil(this.outSize / workgroupSize));

    await this.root.device.queue.onSubmittedWorkDone();
  }
}
