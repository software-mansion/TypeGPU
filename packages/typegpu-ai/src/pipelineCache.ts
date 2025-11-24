import { TgpuComputePipeline } from '../../typegpu/src/core/pipeline/computePipeline';
import { TgpuRoot } from '../../typegpu/src/core/root/rootTypes';
import type { TgpuComputeFn, TgpuFn } from 'typegpu';
import { GemmCompute } from './layers/Gemm/compute';
import { activationFunctionSlot } from './schemas';
import { relu } from './layers/activations/activationFunctions';

export type Layer =
  | { kind: 'Gemm'; compute: TgpuComputeFn }
  | { kind: 'Conv'; compute: TgpuComputeFn }
  | { kind: 'MaxPool'; compute: TgpuComputeFn }
  | { kind: 'Flatten'; compute: TgpuComputeFn };
export type Activation =
  | { kind: 'relu'; fn: TgpuFn }
  | { kind: 'identity'; fn: TgpuFn }
  | { kind: 'sigmoid'; fn: TgpuFn }
  | { kind: 'tanh'; fn: TgpuFn };

export class PipelineCache {
  private cache = new WeakMap<
    Layer,
    WeakMap<Activation, TgpuComputePipeline>
  >();
  constructor(
    private readonly root: TgpuRoot,
  ) {}

  get(layer: Layer, activation: Activation): TgpuComputePipeline {
    let layerObj = this.cache.get(layer);
    if (!layerObj) {
      const newLayerObj = new WeakMap<Activation, TgpuComputePipeline>();
      this.cache.set(layer, newLayerObj);
      layerObj = newLayerObj;
    }

    let pipeline = layerObj.get(activation);
    if (!pipeline) {
      pipeline = this.root['~unstable']
        .with(activationFunctionSlot, activation.fn)
        .withCompute(layer.compute)
        .createPipeline();
      layerObj.set(activation, pipeline);
    }
    return pipeline;
  }
}
