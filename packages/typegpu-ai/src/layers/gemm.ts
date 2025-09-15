
import type { OnnxModel } from '../onnx/types.ts';

export interface GemmLayerSpec {
  weights: Float32Array;
  biases: Float32Array;
}

export function extractGemmLayerSpecs(model: OnnxModel): GemmLayerSpec[] {
  const initMap = model.tensorMap;
  const specs: GemmLayerSpec[] = [];

  for (const node of model.graph.nodes) {
    if (node.opType !== 'Gemm') continue;
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

    // const outDim = Number(weightTensor.dims[0]);
    // const inDim = Number(weightTensor.dims[1]);
    // const transBAttr = node.attributes.find((a) => a.name === 'transB');
    // const transB = transBAttr ? Number(transBAttr.value as any) === 1 : false;

    const weightsData = weightTensor.data as Float32Array;
    // if (transB) {
    //   weightsData = transposeFloat32(weightsData, outDim, inDim);
    // }

    specs.push({ weights: weightsData, biases: biasTensor.data as Float32Array });
  }
  return specs;
}

export function computeMaxBufferSize(specs: GemmLayerSpec[]): number {
  const maxOut = Math.max(...specs.map((l) => l.biases.length));
  const maxIn = Math.max(
    ...specs.map((l) => Math.floor(l.weights.length / l.biases.length)),
  );
  return Math.max(maxOut, maxIn);
}

