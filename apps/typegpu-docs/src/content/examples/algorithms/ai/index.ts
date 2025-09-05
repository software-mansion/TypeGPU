import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import OnnxLoader, { createDenseReluNetwork } from '@typegpu/ai';
import type { NetworkRunner } from '../../../../../../../packages/typegpu-ai/src/schemas';
import { exampleKMNISTInput } from './KMNIST_example.ts';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const MODEL_PATH = '/TypeGPU/assets/MNISTImageClassifier.onnx';
const root = await tgpu.init();

let network: NetworkRunner | undefined;

try {
  const loader = await OnnxLoader.fromPath(MODEL_PATH);
  network = createDenseReluNetwork(root, loader.model);
  console.log(
    '[AI Example] Dense network layers:',
    network.layers.map((l) => ({ in: l.inSize, out: l.outSize })),
  );
  runExampleInference();
} catch (err) {}

export const controls = {
  'Run KMNIST Example': { onButtonClick: () => void runExampleInference() },
};

async function runExampleInference() {
  if (!network) return;
  const inSize = network.layers[0].inSize;
  if (exampleKMNISTInput.length !== inSize) {
    console.warn('[AI Example] KMNIST example size mismatch', exampleKMNISTInput.length, '!=', inSize);
    return;
  }
  const out = await network.run(exampleKMNISTInput);
  console.log('[AI Example] Inference output:', out.slice(0, Math.min(16, out.length)));
}
