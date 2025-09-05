import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import OnnxLoader, { createDenseReluNetwork } from '@typegpu/ai';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const MODEL_PATH = '/TypeGPU/assets/model.onnx';
const root = await tgpu.init();
const device = root.device;

let network: ReturnType<typeof createDenseReluNetwork> | undefined;

try {
  const loader = await OnnxLoader.fromPath(MODEL_PATH);
  network = createDenseReluNetwork(root, loader.model);
  console.log(
    '[AI Example] Dense network layers:',
    network.layers.map((l) => ({ in: l.inSize, out: l.outSize })),
  );
  runRandomInference();
} catch (err) {}

export const controls = {
  'Run Random Inference': { onButtonClick: () => void runRandomInference() },
};

async function runRandomInference() {
  if (!network) return;
  const inSize = network.layers[0].inSize;
  const input = Float32Array.from(
    { length: inSize },
    () => Math.random() * 2 - 1,
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
