import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import OnnxModelLoader from '@typegpu/ai';
import { summarizeModel } from '../../../../../../../packages/typegpu-ai/src/onnx/utils';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const root = await tgpu.init();
const device = root.device;


let loadedModel: Awaited<ReturnType<typeof OnnxModelLoader.fromPath>> | undefined;
let nodeWeightRefs: { index: number; weightNames: string[] }[] = [];

async function testModelLoad() {
  const MODEL_PATH = '/TypeGPU/assets/model.onnx';
  try {
    const loader = await OnnxModelLoader.fromPath(MODEL_PATH);
    loadedModel = loader;
    console.log(loader.getNodes());
    const initSet = new Set(loader.listInitializers());
 
    const inputNames = loader.getInputNames();
    const outputNames = loader.getOutputNames();
    const initNames = loader.listInitializers();
    console.log(summarizeModel(loader.model));
    console.log('[AI Example] ONNX model loaded OK:', {
      path: MODEL_PATH,
      bufferBytes: loader.buffer.byteLength,
      inputs: inputNames,
      outputs: outputNames,
      initializers: initNames.length,
      firstInitializer: initNames[0],
    });
    // Return boolean for potential future UI hook.
  return true;
  } catch (err) {
    console.error('[AI Example] Failed to load ONNX model:', err);
    return false;
  }
}

// Kick off immediately; ignore result for now (but could be surfaced in UI later)
void testModelLoad();
const table = document.querySelector('.counter') as HTMLDivElement;

export const controls = {
  'Show First Weight Layer': {
    onButtonClick: () => {
      if (!loadedModel) { console.warn('Model not loaded yet'); return; }
      if (nodeWeightRefs.length === 0) {
        console.warn('No nodes with weight initializers found. Initializers:', loadedModel.listInitializers());
        return;
      }
      const first = nodeWeightRefs[0];
      const tensors = first.weightNames
        .map(n => loadedModel!.getTensor(n))
        .filter((t): t is NonNullable<typeof t> => t != null);
      const summary = tensors.map(t => ({
        name: t.name,
        dims: t.dims,
        elements: t.elementCount,
        sample: sampleTensorData(t.data, 8),
      }));
      console.log('[AI Example] First weight-bearing node index', first.index, 'tensors:', summary);
    },
  },

};

function sampleTensorData(data: any, limit: number) {
  if (!data) return null;
  if (ArrayBuffer.isView(data)) {
    const arr = Array.from((data as any).slice(0, limit));
    return arr;
  }
  if (Array.isArray(data)) return data.slice(0, limit);
  return null;
}

export function onCleanup() {
  root.destroy();
}
