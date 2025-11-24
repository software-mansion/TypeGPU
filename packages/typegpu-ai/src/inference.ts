import { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import type { Node, OnnxModel } from './onnx/types.ts';
import { PipelineCache } from './pipelineCache.ts';
import { type NetworkRunner } from './schemas.ts';
import { LGemm } from './layers/Gemm/gemm.ts';
import { NNLayer } from './layers/gpuLayer.ts';
import { LConv } from './layers/Conv/conv.ts';
import { LMaxPool } from './layers/MaxPool/maxPool.ts';
import { LFlatten } from './layers/Flatten/flatten.ts';

export class Inference {
  private layers: NNLayer[] = [];

  constructor(
    private readonly root: TgpuRoot,
    public readonly model: OnnxModel,
    private readonly pipelineCache = new PipelineCache(root),
  ) { }

  createNetwork(): NetworkRunner {
    let maxBufferSize = 0;
    console.log('Processing model:', this.model);

    // Initialize current shape from graph input
    // Assuming [batch, channels, height, width] or [batch, channels]
    const inputInfo = this.model.graph.inputs[0];
    if (!inputInfo || !inputInfo.shape) {
      throw new Error('Model input shape not found');
    }

    // We assume NCHW layout for image inputs
    // shape[0] is batch (usually symbolic or 1), shape[1] is C, shape[2] is H, shape[3] is W
    let currentShape = {
      channels: Number(inputInfo.shape[1]),
      height: Number(inputInfo.shape[2]),
      width: Number(inputInfo.shape[3]),
    };

    console.log('Initial shape:', currentShape);

    for (const node of this.model.graph.nodes) {
      switch (node.opType) {
        case 'Flatten': {
          // Flatten is usually a reshape. Since we operate on flat buffers, we just need to ensure
          // the size is propagated. We use a copy layer to be explicit.
          // We assume input size matches the output size of the previous layer.
          const prevLayer = this.layers[this.layers.length - 1];
          if (!prevLayer) {
            throw new Error('Flatten layer cannot be the first layer');
          }

          const layer = new LFlatten(
            this.root,
            this.pipelineCache,
            prevLayer.outSize,
          );
          this.layers.push(layer);
          maxBufferSize = Math.max(maxBufferSize, layer.inSize, layer.outSize);
          break;
        }
        case 'Gemm': {
          const layer = new LGemm(
            this.root,
            this.model.tensorMap.get(node.inputs[1]!)!,
            this.model.tensorMap.get(node.inputs[2]!)!,
            this.pipelineCache,
          );
          this.layers.push(layer);
          maxBufferSize = Math.max(maxBufferSize, layer.inSize, layer.outSize);
          break;
        }
        case 'Conv': {
          const pads = getAttr(node, 'pads')?.value as number[] | undefined;
          const strides = getAttr(node, 'strides')?.value as number[] | undefined;
          const group = getAttr(node, 'group')?.value as number | undefined;
          const dilations = getAttr(node, 'dilations')?.value as number[] | undefined;

          if (group && group !== 1) throw new Error('Grouped convolution not supported');
          if (dilations && (dilations[0] !== 1 || dilations[1] !== 1)) throw new Error('Dilated convolution not supported');

          const weightsTensor = this.model.tensorMap.get(node.inputs[1]!);
          if (!weightsTensor) throw new Error(`Weights not found for ${node.name}`);

          const biasTensor = this.model.tensorMap.get(node.inputs[2]!);
          if (!biasTensor) throw new Error(`Bias not found for ${node.name}`);

          const outputChannels = Number(weightsTensor.dims[0]);
          const kernelHeight = Number(weightsTensor.dims[2]);
          const kernelWidth = Number(weightsTensor.dims[3]);

          const padH = pads?.[0] ?? 0;
          const padW = pads?.[1] ?? 0;
          const padH_bottom = pads?.[2] ?? padH;
          const padW_right = pads?.[3] ?? padW;
          const strideH = strides?.[0] ?? 1;
          const strideW = strides?.[1] ?? 1;

          const outputHeight = Math.floor((currentShape.height + padH + padH_bottom - kernelHeight) / strideH) + 1;
          const outputWidth = Math.floor((currentShape.width + padW + padW_right - kernelWidth) / strideW) + 1;

          const layer = new LConv(
            this.root,
            this.pipelineCache,
            weightsTensor.data as Float32Array,
            biasTensor.data as Float32Array,
            {
              inputChannels: currentShape.channels,
              inputHeight: currentShape.height,
              inputWidth: currentShape.width,
              kernelHeight,
              kernelWidth,
              strideH,
              strideW,
              padH,
              padW,
              outputChannels,
              outputHeight,
              outputWidth,
            },
            'relu', // TODO: parse activation from fused operator or subsequent node?
          );

          currentShape = {
            channels: outputChannels,
            height: outputHeight,
            width: outputWidth,
          };

          this.layers.push(layer);
          maxBufferSize = Math.max(maxBufferSize, layer.inSize, layer.outSize);
          break;
        }
        case 'MaxPool': {
          const pads = getAttr(node, 'pads')?.value as number[] | undefined;
          const strides = getAttr(node, 'strides')?.value as number[] | undefined;
          const kernelShape = getAttr(node, 'kernel_shape')?.value as number[] | undefined;

          if (!kernelShape) {
            throw new Error('MaxPool node missing kernel_shape attribute');
          }

          const kH = kernelShape[0] ?? 1;
          const kW = kernelShape[1] ?? 1;
          const strideH = strides?.[0] ?? 1;
          const strideW = strides?.[1] ?? 1;
          const padH = pads?.[0] ?? 0;
          const padW = pads?.[1] ?? 0;
          const padH_bottom = pads?.[2] ?? padH;
          const padW_right = pads?.[3] ?? padW;

          const outputHeight = Math.floor((currentShape.height + padH + padH_bottom - kH) / strideH) + 1;
          const outputWidth = Math.floor((currentShape.width + padW + padW_right - kW) / strideW) + 1;

          const layer = new LMaxPool(
            this.root,
            this.pipelineCache,
            {
              channels: currentShape.channels,
              inH: currentShape.height,
              inW: currentShape.width,
              kH,
              kW,
              strideH,
              strideW,
              padH,
              padW,
              outH: outputHeight,
              outW: outputWidth,
            },
          );

          currentShape = {
            channels: currentShape.channels,
            height: outputHeight,
            width: outputWidth,
          };

          this.layers.push(layer);
          maxBufferSize = Math.max(maxBufferSize, layer.inSize, layer.outSize);
          break;
        }
        default:
          continue;
      }
    }

    if (this.layers.length === 0) {
      throw new Error('No supported layers found while creating the network');
    }

    const bufferCapacity = Math.max(1, maxBufferSize);
    const bufferA = this.root.createBuffer(d.arrayOf(d.f32, bufferCapacity))
      .$usage('storage');
    const bufferB = this.root.createBuffer(d.arrayOf(d.f32, bufferCapacity))
      .$usage('storage');


    const run = async (input: number[] | Float32Array): Promise<number[]> => {
      const firstLayer = this.layers[0]!;
      const inputArray = Array.isArray(input) ? input : Array.from(input);

      if (inputArray.length !== firstLayer.inSize) {
        throw new Error(
          `Input length ${inputArray.length} does not match network input size ${firstLayer.inSize}`,
        );
      }

      bufferA.write(inputArray);

      let readBuf = bufferA;
      let writeBuf = bufferB;
      let expectedInputSize = firstLayer.inSize;

      for (let i = 0; i < this.layers.length; i++) {
        const layer = this.layers[i]!;
        if (layer.inSize !== expectedInputSize) {
          throw new Error(
            `Layer ${i} expected input size ${layer.inSize}, got ${expectedInputSize}`,
          );
        }

        await layer.run(readBuf, writeBuf);
        expectedInputSize = layer.outSize;

        if (i !== this.layers.length - 1) {
          const tmp = readBuf;
          readBuf = writeBuf;
          writeBuf = tmp;
        }
      }

      const finalBuffer = writeBuf;
      const raw = await finalBuffer.read();
      const lastLayer = this.layers[this.layers.length - 1]!;
      const slice = Array.from(raw.slice(0, lastLayer.outSize));
      return softmax(slice);
    };

    return { run };
  }

  // TODO: delegate calculating max buffer size to ONNX loader layer builder.
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}

function getAttr(node: Node, name: string) {
  return node.attributes.find((a) => a.name === name);
}
