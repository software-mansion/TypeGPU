import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import OnnxLoader, { createDenseReluNetwork } from '@typegpu/ai';
import type { NetworkRunner } from '../../../../../../../packages/typegpu-ai/src/schemas';
import {
  exampleKMNISTInput0,
  exampleKMNISTInput1,
  exampleKMNISTInput4,
  exampleKMNISTInput9,
} from './KMNIST_example.ts';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const MODEL_PATH = '/TypeGPU/assets/ai/kmnist2137.onnx';
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
  const out = await network.run(exampleKMNISTInput1);
  console.log(
    '[AI Example] Inference output:',
    out,
  );
}
