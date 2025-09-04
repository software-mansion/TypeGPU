import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import OnnxLoader, { createDenseReluNetwork } from '@typegpu/ai';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const root = await tgpu.init();
const device = root.device;

let loadedModel: Awaited<ReturnType<typeof OnnxLoader.fromPath>> | undefined;
let network: ReturnType<typeof createDenseReluNetwork> | undefined;

async function testModelLoad() {
  const MODEL_PATH = '/TypeGPU/assets/model.onnx';
  try {
    const loader = await OnnxLoader.fromPath(MODEL_PATH);
    loadedModel = loader;
    const tensors = loader.model.graph.initializers;
    const weights: { weights: Float32Array; biases: Float32Array }[] = [];
    const sorted = [...tensors].filter((t) => t.data instanceof Float32Array)
      .sort((a, b) => b.elementCount - a.elementCount);
    for (const w of sorted) {
      if (w.dims.length !== 2) continue;
      const outDim = Number(w.dims[0]);
      const bias = sorted.find((b) =>
        b.dims.length === 1 && Number(b.dims[0]) === outDim && b !== w
      );
      if (!bias) continue;
      if (
        !(w.data instanceof Float32Array) ||
        !(bias.data instanceof Float32Array)
      ) continue;
      // Avoid reusing same bias multiple times
      if (weights.some((x) => x.biases === bias.data)) continue;
      weights.push({ weights: w.data, biases: bias.data });
      if (weights.length === 3) break; // target 3 dense layers
    }
    if (weights.length === 3) {
      network = createDenseReluNetwork(root, weights);
      console.log(
        '[AI Example] Network created with layers:',
        weights.map((l) => ({
          in: l.weights.length / l.biases.length,
          out: l.biases.length,
        })),
      );
      runRandomInference();
    } else {
      console.warn(
        '[AI Example] Could not assemble 3 dense layers automatically. Found',
        weights.length,
      );
    }
  } catch (err) {}
}

void testModelLoad();

async function runRandomInference() {
  if (!network) return;
  const inSize = network.layers[0].inSize;
  const input = Float32Array.from(
    { length: inSize },
    () => Math.random() * 2 - 1,
  );
  console.log(
    '[AI Example] Running inference with random input of length',
    inSize,
  );
  const out = await network.run(input);
  console.log(await network.run(input));
  console.log(
    '[AI Example] Output length',
    out.length,
    ' sample:',
    out.slice(0, Math.min(8, out.length)),
  );
}

export const controls = {
  'Run Random Inference': { onButtonClick: () => void runRandomInference() },
};
