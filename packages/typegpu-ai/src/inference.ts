import type { TgpuRoot } from 'typegpu';
import type { OnnxModel } from './onnx/types.ts';
import * as d from 'typegpu/data';
import { computeMaxBufferSize, extractGemmLayerSpecs } from './layers/gemm.ts';
import { validateLayerSizes } from './sizeMismatch.ts';
import { Layer, PipelineCache } from './pipelineCache.ts';
import { identity, relu } from './compute/activationFunctions.ts';
import { nnCompute } from './compute/compute.ts';
import { ioLayout, weightsBiasesLayout, workgroupSize, type GpuLayer, type NetworkRunner } from './schemas.ts';


export class Inference {
    private layers: GpuLayer[] = [];

  constructor(
    private readonly root: TgpuRoot,
    public readonly model: OnnxModel,
    private readonly pipelineCache = new PipelineCache(root),
  ) {}

  // TODO: delegate calculating max buffer size to ONNX loader layer builder.
  createNetwork(): NetworkRunner {
    const gemmSpecs = extractGemmLayerSpecs(this.model);

    // 2. Shared ping-pong buffers sized for largest layer
    const bufferSize = computeMaxBufferSize(gemmSpecs);
    const bufferA = this.root.createBuffer(d.arrayOf(d.f32, bufferSize)).$usage('storage');
    const bufferB = this.root.createBuffer(d.arrayOf(d.f32, bufferSize)).$usage('storage');
    let readBuf = bufferA;
    let writeBuf = bufferB;

    let prevOut: number | null = null;

    for (let i = 0; i < gemmSpecs.length; i++) {
      const spec = gemmSpecs[i]!;
      const { weights, biases } = spec;

      const { inSize, outSize } = validateLayerSizes(weights, biases, i, prevOut);
      if (i === 0) prevOut = inSize; // initial input size tracking

      // GPU resident parameter buffers
      const weightsBuf = this.root.createBuffer(d.arrayOf(d.f32, weights.length), [...weights] as number[]).$usage('storage');
      const biasesBuf = this.root.createBuffer(d.arrayOf(d.f32, biases.length), [...biases] as number[]).$usage('storage');

      const inLenBuf = this.root.createBuffer(d.u32, inSize).$usage('uniform');
      const outLenBuf = this.root.createBuffer(d.u32, outSize).$usage('uniform');

      const io = this.root.createBindGroup(ioLayout, {
        input: readBuf,
        output: writeBuf,
        inLength: inLenBuf,
        outLength: outLenBuf,
      });
      const params = this.root.createBindGroup(weightsBiasesLayout, {
        weights: weightsBuf,
        biases: biasesBuf,
      });

      // Descriptor for pipeline cache (one compute fn for Gemm currently)
      const isLast = i === gemmSpecs.length - 1;
      const activation= isLast
        ? { kind: 'identity' as const, fn: identity }
        : { kind: 'relu' as const, fn: relu };

      this.layers.push({
        kind: 'Gemm',
        inSize,
        outSize,
        weights: weightsBuf,
        biases: biasesBuf,
        io,
        params,
        compute: nnCompute,
        activation,
      });

      prevOut = outSize;

      // Ping-pong swap except for last layer (no need to write output that won't be read)
      if (!isLast) {
        const tmp = readBuf; readBuf = writeBuf; writeBuf = tmp;
      }
    }

    const run = async (input: number[] | Float32Array): Promise<number[]> => {
      // Upload initial input to first read buffer (bufferA)
      bufferA.write(Array.isArray(input) ? input : Array.from(input));

      for (const layer of this.layers) {
        if (layer.kind === 'Gemm') {
          const pipeline = this.pipelineCache.get({kind: layer.kind, compute: layer.compute}, layer.activation);
          pipeline
            .with(ioLayout, layer.io)
            .with(weightsBiasesLayout, layer.params)
            .dispatchWorkgroups(Math.ceil(layer.outSize / workgroupSize));
          await this.root.device.queue.onSubmittedWorkDone();
        } else if (layer.kind === 'Conv') {
          // Conv placeholder: implemented when Conv layer available
          continue;
        }
      }

      // Determine final output buffer: if number of Gemm layers is odd, result ended in bufferB else bufferA
      const finalBuffer = (this.layers.filter(l => l.kind === 'Gemm').length % 2 === 1) ? bufferB : bufferA;
      const raw = await finalBuffer.read();
      const last = this.layers[this.layers.length - 1];
      let outSize: number;
      if (last?.kind === 'Gemm') outSize = last.outSize; else outSize = raw.length; // fallback
      const slice = Array.from(raw.slice(0, outSize));
      return softmax(slice);
    };

    return { run };
  }
}


function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}
