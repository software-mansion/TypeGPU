import type { TgpuRoot } from 'typegpu';
import type { OnnxModel, Tensor } from './onnx/types.ts';
import * as d from 'typegpu/data';
import { nnCompute } from './compute.ts';
import {
  activationFunctionSlot,
  DenseLayerGpu,
  ioLayout,
  NetworkRunner,
  weightsBiasesLayout,
  workgroupSize,
} from './schemas.ts';
import { identity, relu } from './activationFunctions.ts';

// TODO: delegate calcing maxBufferSize to OnnxLoader
export function createDenseReluNetwork(
  root: TgpuRoot,
  model: OnnxModel,
): NetworkRunner {
  const initMap = model.tensorMap;

  // extract layers
  const layerSpecs: { weights: Float32Array; biases: Float32Array }[] = [];
  for (const node of model.graph.nodes) {
    if (node.opType !== 'Gemm') continue;
    // Gemm inputs: [A, B, C?] — B is weights, C optional bias
    const weightTensor = initMap.get(node.inputs[1] as string);
    const biasName = node.inputs[2] as string;
    const biasTensor = biasName ? initMap.get(biasName) : undefined;

    if (!weightTensor || !biasTensor) continue;
    if (
      !(weightTensor.data instanceof Float32Array) ||
      !(biasTensor.data instanceof Float32Array)
    ) continue;
    if (weightTensor.dims.length !== 2 || biasTensor.dims.length !== 1) {
      continue;
    }
    let weightsData = weightTensor.data as Float32Array;

    // const transBAttr = node.attributes.find((a) => a.name === 'transB'); //pytorch transpose
    // const transB = transBAttr ? Number(transBAttr.value as any) === 1 : false;
    // if (transB) {
    //   weightsData = transposeFloat32(weightsData, outDim, inDim);
    // }

    layerSpecs.push({
      weights: weightsData,
      biases: biasTensor.data as Float32Array,
    });
  }

  console.log('before shader', layerSpecs);
  const device = root.device;
  const layers: DenseLayerGpu[] = [];

  // buffers
  const maxOut = Math.max(...layerSpecs.map((l) => l.biases.length));
  const maxIn = Math.max(
    ...layerSpecs.map((l) => Math.floor(l.weights.length / l.biases.length)),
  );
  const bufferSize = Math.max(maxOut, maxIn);
  const bufferA = root.createBuffer(d.arrayOf(d.f32, bufferSize)).$usage(
    'storage',
  );
  const bufferB = root.createBuffer(d.arrayOf(d.f32, bufferSize)).$usage(
    'storage',
  );
  let currentInputBuffer = bufferA;
  let currentOutputBuffer = bufferB;

  const reluPipeline = root['~unstable'].with(activationFunctionSlot, relu)
    .withCompute(nnCompute).createPipeline();
  const idPipeline = root['~unstable'].with(activationFunctionSlot, identity)
    .withCompute(nnCompute).createPipeline();

  let prevOut = null;
  for (let idx = 0; idx < layerSpecs.length; idx++) {
    const { weights, biases } = layerSpecs[idx]!;
    const outSize = biases.length;
    const inSize = weights.length / outSize;
    if (inSize * outSize !== weights.length) {
      throw new Error(
        `Layer ${idx} weight length mismatch: got ${weights.length} vs ${inSize}*${outSize}`,
      );
    }
    if (idx === 0) prevOut = inSize; // initial input size
    if (inSize !== prevOut) {
      throw new Error(
        `Layer ${idx} input size ${inSize} != previous output size ${prevOut}`,
      );
    }

    const weightsBuffer = root.createBuffer(
      d.arrayOf(d.f32, weights.length),
      [...weights] as number[],
    ).$usage('storage');
    const biasesBuffer = root.createBuffer(
      d.arrayOf(d.f32, biases.length),
      [...biases] as number[],
    ).$usage('storage');
    const inLenBuf = root.createBuffer(d.u32, inSize).$usage('uniform');
    const outLenBuf = root.createBuffer(d.u32, outSize).$usage('uniform');
    const ioBindGroup = root.createBindGroup(ioLayout, {
      input: currentInputBuffer,
      output: currentOutputBuffer,
      inLength: inLenBuf,
      outLength: outLenBuf,
    });
    const wbBindGroup = root.createBindGroup(weightsBiasesLayout, {
      weights: weightsBuffer,
      biases: biasesBuffer,
    });

    layers.push({
      inSize,
      outSize,
      weights: weightsBuffer,
      biases: biasesBuffer,
      ioBindGroup,
      wbBindGroup,
    });
    prevOut = outSize;

    // ping-pong
    if (idx < layerSpecs.length - 1) {
      const tmp = currentInputBuffer;
      currentInputBuffer = currentOutputBuffer;
      currentOutputBuffer = tmp;
    }
  }

  async function run(input: number[] | Float32Array): Promise<number[]> {
    // initial input into bufferA
    bufferA.write(Array.isArray(input) ? input : Array.from(input));

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]!;
      const isLast = i === layers.length - 1;
      const pipeline = isLast ? idPipeline : reluPipeline;

      pipeline.with(ioLayout, layer.ioBindGroup)
      .with(weightsBiasesLayout, layer.wbBindGroup)
      .dispatchWorkgroups(Math.ceil(layer.outSize / workgroupSize));
  
      await device.queue.onSubmittedWorkDone();
    }

    // result in: if layer count odd -> bufferB else -> bufferA (because of last swap rule)
    const finalBuffer = (layers.length % 2 === 1) ? bufferB : bufferA;
    const outFull = await finalBuffer.read();
    const finalSize = layers[layers.length - 1]!.outSize;
    // only apply softmax over the actual output slice
    const slice = Array.from(outFull.slice(0, finalSize));
    const out = softmax(slice);
    return out;
  }

  return { run, layers };
}

function softmax(arr: number[]): number[] {
  const max = Math.max(...arr);
  const exps = arr.map((x) => Math.exp(x - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / sum);
}
