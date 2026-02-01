import type { TgpuComputeFn, TgpuComputePipeline, TgpuFn, TgpuRoot } from 'typegpu';
import { activationFunctionSlot } from './schemas';

export type Layer =
  | { kind: 'Gemm'; compute: TgpuComputeFn }
  | { kind: 'Conv'; compute: TgpuComputeFn }
  | { kind: 'MaxPool'; compute: TgpuComputeFn }
  | { kind: 'Flatten'; compute: TgpuComputeFn }
  | { kind: 'Resize'; compute: TgpuComputeFn }
  | { kind: 'Concat'; compute: TgpuComputeFn }
  | { kind: 'Add'; compute: TgpuComputeFn }
  | { kind: 'Clip'; compute: TgpuComputeFn }
  | { kind: 'Shape'; compute: TgpuComputeFn }
  | { kind: 'ConvTranspose'; compute: TgpuComputeFn }
  | { kind: 'Relu'; compute: TgpuComputeFn }
  | { kind: 'Sigmoid'; compute: TgpuComputeFn }
  | { kind: 'Tanh'; compute: TgpuComputeFn };
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
  ) { }

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
