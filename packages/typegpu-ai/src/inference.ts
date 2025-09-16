import { tgpu, type TgpuRoot } from 'typegpu';
import type { OnnxModel } from './onnx/types.ts';
import * as d from 'typegpu/data';
import { validateLayerSizes } from './sizeMismatch.ts';
import { Layer, PipelineCache } from './pipelineCache.ts';
import { identity, relu } from './compute/activationFunctions.ts';
import { nnCompute } from './compute/compute.ts';
import {
  type GpuLayer,
  ioLayout,
  type NetworkRunner,
  weightsBiasesLayout,
  workgroupSize,
} from './schemas.ts';

export class Inference {
  private layers: GpuLayer[] = [];

  constructor(
    private readonly root: TgpuRoot,
    public readonly model: OnnxModel,
    private readonly pipelineCache = new PipelineCache(root),
  ) {}

  createNetwork(): NetworkRunner {
    let maxBufferSize = 0;
    for (const node of this.model.graph.nodes) {
      switch (node.opType) {
        case 'Flatten':
          continue; // no-op for Flatten in this simple implementation
        case 'Relu':
        case 'Sigmoid':
        case 'Softmax':
          continue;
        case 'Gemm': {
          const weightTensor = this.model.tensorMap.get(
            node.inputs[1] as string,
          );
          const biasName = node.inputs[2] as string;
          const biasTensor = biasName
            ? this.model.tensorMap.get(biasName)
            : undefined;
          if (
            !weightTensor || !biasTensor ||
            !(weightTensor.data instanceof Float32Array) ||
            !(biasTensor.data instanceof Float32Array) ||
            weightTensor.dims.length !== 2 || biasTensor.dims.length !== 1
          ) continue;

          const weightsData = weightTensor.data as Float32Array;
          const biasesData = biasTensor.data as Float32Array;
          const result: GpuLayer = {
            kind: 'Gemm',
            inSize: weightsData.length / biasesData.length,
            outSize: biasesData.length,
            weights: weightsData,
            biases: biasesData,
            io: null as any, // to be filled in later
            params: null as any, // to be filled in later
            compute: nnCompute,
            activation: { kind: 'relu', fn: relu },
          };
          this.layers.push(result);
          maxBufferSize = Math.max(
            maxBufferSize,
            Math.max(weightsData.length / biasesData.length, biasesData.length),
          );
          break;
        }
        case 'Conv': {
          // handle Conv node
          break;
        }
        default:
          throw new Error(`Unsupported node type: ${node.opType}`);
      }
    }

    const bufferA = this.root.createBuffer(d.arrayOf(d.f32, maxBufferSize))
      .$usage('storage');
    const bufferB = this.root.createBuffer(d.arrayOf(d.f32, maxBufferSize))
      .$usage('storage');
    let readBuf = bufferA;
    let writeBuf = bufferB;

    let prevOut: number | null = null;
    for (let i = 0; i < this.layers.length; i++) {
      const layer = this.layers[i]!;
      switch (layer.kind) {
        case 'Gemm': {
          const { inSize, outSize } = validateLayerSizes(
            layer.weights,
            layer.biases,
            i,
            prevOut,
          );
          if (i === 0) prevOut = inSize; // initial input size tracking

          const inLenBuf = this.root.createBuffer(d.u32, inSize).$usage(
            'uniform',
          );
          const outLenBuf = this.root.createBuffer(d.u32, outSize).$usage(
            'uniform',
          );

          layer.io = this.root.createBindGroup(ioLayout, {
            input: readBuf,
            output: writeBuf,
            inLength: inLenBuf,
            outLength: outLenBuf,
          });
          layer.params = this.root.createBindGroup(weightsBiasesLayout, {
            weights: this.root.createBuffer(
              d.arrayOf(d.f32, layer.weights.length),
              [...layer.weights],
            ).$usage('storage'),
            biases: this.root.createBuffer(
              d.arrayOf(d.f32, layer.biases.length),
              [...layer.biases],
            ).$usage('storage'),
          });

          prevOut = outSize;

          // Ping-pong swap
          if (i !== this.layers.length - 1) {
            const tmp = readBuf;
            readBuf = writeBuf;
            writeBuf = tmp;
          }
          break;
        }
        case 'Conv':
          continue;
        default:
          throw new Error(`Unsupported layer kind: ${(layer as any).kind}`);
      }
    }

    const run = async (input: number[] | Float32Array): Promise<number[]> => {
      // Upload initial input to first read buffer (bufferA)
      bufferA.write(Array.isArray(input) ? input : Array.from(input));

      for (const layer of this.layers) {
        if (layer.kind === 'Gemm') {
          const pipeline = this.pipelineCache.get({
            kind: layer.kind,
            compute: layer.compute,
          }, layer.activation);
          pipeline
            .with(ioLayout, layer.io)
            .with(weightsBiasesLayout, layer.params)
            .dispatchWorkgroups(Math.ceil(layer.outSize / workgroupSize));
          await this.root.device.queue.onSubmittedWorkDone();
        } else if (layer.kind === 'Conv') {
          continue;
        }
      }

      // Determine final output buffer: if number of Gemm layers is odd, result ended in bufferB else bufferA
      const finalBuffer =
        (this.layers.filter((l) => l.kind === 'Gemm').length % 2 === 1)
          ? bufferB
          : bufferA;
      const raw = await finalBuffer.read();
      const last = this.layers[this.layers.length - 1];
      let outSize: number;
      if (last?.kind === 'Gemm') outSize = last.outSize;
      else outSize = raw.length; // fallback
      const slice = Array.from(raw.slice(0, outSize));
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
