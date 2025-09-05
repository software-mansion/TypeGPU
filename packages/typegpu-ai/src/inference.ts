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

/**
 * Create a dense (fully-connected) + ReLU network runner.
 * When given an OnnxModel, we auto-extract layer weights/biases by:
 *  - Scanning all initializers with dims.length === 2 as weight matrices
 *  - For each weight tensor W (out x in) locating a unique bias tensor b with dims.length === 1 and dims[0] === out
 *  - Ordering layers by descending weight element count (heuristic consistent with prior manual example)
 *  - Maintaining original order heuristic (largest -> smallest) while preventing bias reuse
 *
 * Limitations (current simplified implementation):
 *  - Ignores actual node graph topology; purely pairs weight/bias tensors
 *  - Assumes weight dims are [out, in]
 *  - Stops when no unique matching bias is found for a weight
 */
export function createDenseReluNetwork(
  root: TgpuRoot,
  model: OnnxModel,
): NetworkRunner {
  // Auto-extract from ONNX initializers (assumes only dense + activations relevant)
  const tensors = model.graph.initializers;
  const sorted = [...tensors]
    .filter((t): t is Tensor & { data: Float32Array } =>
      t.data instanceof Float32Array
    )
    .sort((a, b) => b.elementCount - a.elementCount);
  const usedBiases = new Set<Tensor>();
  const layerSpecs: { weights: Float32Array; biases: Float32Array }[] = [];
  for (const w of sorted) {
    if (w.dims.length !== 2) continue;
    const outDim = Number(w.dims[0]);
    const bias = sorted.find((b) =>
      b !== w && !usedBiases.has(b) && b.dims.length === 1 &&
      Number(b.dims[0]) === outDim
    );
    if (!bias) continue;
    if (!(bias.data instanceof Float32Array)) continue;
    layerSpecs.push({ weights: w.data, biases: bias.data });
    usedBiases.add(bias);
  }
  if (layerSpecs.length === 0) {
    throw new Error(
      '[typegpu-ai] No dense layers could be inferred from ONNX model (need weight[O,I] & bias[O]).',
    );
  }
  const device = root.device;
  const layers: DenseLayerGpu[] = [];

  const maxOut = Math.max(...layerSpecs.map((l) => l.biases.length));
  const bufferA = root.createBuffer(d.arrayOf(d.f32, maxOut)).$usage('storage');
  const bufferB = root.createBuffer(d.arrayOf(d.f32, maxOut)).$usage('storage');
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
    const ioBindGroup = root.createBindGroup(ioLayout, {
      input: currentInputBuffer,
      output: currentOutputBuffer,
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
    // Write initial input into bufferA
    bufferA.write(Array.isArray(input) ? input : Array.from(input));

    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i]!;
      const isLast = i === layers.length - 1;
      const pipeline = isLast ? idPipeline : reluPipeline;

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(root.unwrap(pipeline));
      pass.setBindGroup(0, root.unwrap(layer.ioBindGroup));
      pass.setBindGroup(1, root.unwrap(layer.wbBindGroup));
      const wgCount = Math.ceil(layer.outSize / workgroupSize);
      pass.dispatchWorkgroups(wgCount);
      pass.end();
      device.queue.submit([encoder.finish()]);
      await device.queue.onSubmittedWorkDone();
    }

    // result in: if layer count odd -> bufferB else -> bufferA (because of last swap rule)
    const finalBuffer = (layers.length % 2 === 0) ? bufferA : bufferB; // after loop, if even layers we swapped last iteration leaving output in initial input buffer
    const out = await finalBuffer.read();

    return out.slice(0, layers[layers.length - 1]!.outSize);
  }

  return { run, layers };
}
