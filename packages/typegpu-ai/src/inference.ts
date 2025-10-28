import { type TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import type { OnnxModel } from './onnx/types.ts';
import { PipelineCache } from './pipelineCache.ts';
import { type NetworkRunner } from './schemas.ts';
import { LGemm } from './layers/Gemm/gemm.ts';
import { NNLayer } from './layers/gpuLayer.ts';

export class Inference {
  private layers: NNLayer[] = [];

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
          continue;
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
        case 'Conv':
          continue;
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
