import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { Inference, OnnxLoader } from '@typegpu/ai';
import type { NetworkRunner } from '../../../../../../../packages/typegpu-ai/src/schemas';
import { exampleKMNISTInput0, exampleKMNISTInput4, exampleKMNISTInput9 } from './KMNIST_example.ts';
import { summarizeModel } from '../../../../../../../packages/typegpu-ai/src/onnx/onnxLoader.ts';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const MODEL_PATH = '/TypeGPU/assets/ai/kmnist2137.onnx';
// const MODEL_PATH = '/TypeGPU/assets/ai/mnist_cnn.onnx';
const root = await tgpu.init();

let network: NetworkRunner | undefined;

try {
  const loader = await OnnxLoader.fromPath(MODEL_PATH);
  network = new Inference(root, loader.model).createNetwork();

  console.log(summarizeModel(loader.model));
  runExampleInference();
} catch (err) {}

export const controls = {
  'Run KMNIST Example': { onButtonClick: () => void runExampleInference() },
};

async function runExampleInference() {
  if (!network) return;
  const out = await network.run(exampleKMNISTInput9);
  console.log(
    '[AI Example] Inference output:',
    out,
  );
}
