

import type { TgpuRoot, TgpuComputePipeline, TgpuBuffer, StorageFlag } from 'typegpu';
import * as d from 'typegpu/data';
import { nnCompute } from './compute.ts';
import { activationFunctionSlot, DenseLayerGpu, ioLayout, NetworkRunner, weightsBiasesLayout, workgroupSize } from './schemas.ts';
import { relu, identity } from './activationFunctions.ts';

export function createDenseReluNetwork(
  root: TgpuRoot,
  layerSpecs: { weights: Float32Array; biases: Float32Array }[],
): NetworkRunner {
  const device = root.device;

  if (layerSpecs.length === 0) throw new Error('No layers provided');

  // Verify shapes chain
  let prevOut = layerSpecs[0]!.weights.length / layerSpecs[0]!.biases.length;
  const layers: DenseLayerGpu[] = [];

  // Create reusable buffers for IO between layers: two ping-pong buffers
  const maxOut = Math.max(...layerSpecs.map(l => l.biases.length));
  const bufferA = root.createBuffer(d.arrayOf(d.f32, maxOut)).$usage('storage');
  const bufferB = root.createBuffer(d.arrayOf(d.f32, maxOut)).$usage('storage');
  let currentInputBuffer = bufferA;
  let currentOutputBuffer = bufferB;

  for (let idx = 0; idx < layerSpecs.length; idx++) {
  const { weights, biases } = layerSpecs[idx]!;
    const outSize = biases.length;
    const inSize = weights.length / outSize;
    if (inSize * outSize !== weights.length) {
      throw new Error(`Layer ${idx} weight length mismatch: got ${weights.length} vs ${inSize}*${outSize}`);
    }
    if (idx === 0) prevOut = inSize; // initial input size
    if (inSize !== prevOut) {
      throw new Error(`Layer ${idx} input size ${inSize} != previous output size ${prevOut}`);
    }

  const weightsBuffer = root.createBuffer(d.arrayOf(d.f32, weights.length), [...weights] as number[]).$usage('storage');
  const biasesBuffer = root.createBuffer(d.arrayOf(d.f32, biases.length), [...biases] as number[]).$usage('storage');

    // Bind groups for this layer referencing the ping-pong IO buffers
    const ioBindGroup = root.createBindGroup(ioLayout, {
      input: currentInputBuffer,
      output: currentOutputBuffer,
    });
    const wbBindGroup = root.createBindGroup(weightsBiasesLayout, {
      weights: weightsBuffer,
      biases: biasesBuffer,
    });

    layers.push({ inSize, outSize, weights: weightsBuffer, biases: biasesBuffer, ioBindGroup, wbBindGroup });
    prevOut = outSize;

    // Swap ping-pong for next layer except final (so final output ends in currentOutputBuffer)
    if (idx < layerSpecs.length - 1) {
      const tmp = currentInputBuffer;
      currentInputBuffer = currentOutputBuffer;
      currentOutputBuffer = tmp;
    }
  }

  // Two pipelines: one with relu (for all but last), one identity (for last)
  const reluPipeline = root['~unstable'].with(activationFunctionSlot, relu).withCompute(nnCompute).createPipeline();
  const idPipeline = root['~unstable'].with(activationFunctionSlot, identity).withCompute(nnCompute).createPipeline();

  async function run(input: number[] | Float32Array): Promise<number[]> {
    if ((input as any).length !== layers[0]!.inSize) {
      throw new Error(`Input length ${(input as any).length} != expected ${layers[0]!.inSize}`);
    }
    // Write initial input into bufferA (which we set as first layer input)
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

    // Final output lives in: if layer count odd -> bufferB else -> bufferA (because of last swap rule)
    const finalBuffer = (layers.length % 2 === 0) ? bufferA : bufferB; // after loop, if even layers we swapped last iteration leaving output in initial input buffer
    const out = await finalBuffer.read();
  return out.slice(0, layers[layers.length - 1]!.outSize);
  }

  function dispose() {
    for (const l of layers) {
      for (const b of [l.weights, l.biases]) {
        try { root.unwrap(b).destroy(); } catch (_) {}
      }
    }
    try { root.unwrap(bufferA).destroy(); } catch (_) {}
    try { root.unwrap(bufferB).destroy(); } catch (_) {}
  }

  return { run, dispose, layers };
}

