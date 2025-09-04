import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import OnnxLoader from '@typegpu/ai';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const root = await tgpu.init();
const device = root.device;

let loadedModel:
  | Awaited<ReturnType<typeof OnnxLoader.fromPath>>
  | undefined;
const nodeWeightRefs: { index: number; weightNames: string[] }[] = [];

async function testModelLoad() {
  const MODEL_PATH = '/TypeGPU/assets/model.onnx';
  try {
    const loader = await OnnxLoader.fromPath(MODEL_PATH);
    loadedModel = loader;
    console.log(loader.getNodes());
    for (const n of loader.getNodes()) {
      console.log(
        n.opType,
        '-',
        n.name ?? '(no name)',
        'inputs=',
        n.inputs,
        'outputs=',
        n.outputs,
      );
    }
  } catch (err) {}
}

void testModelLoad();

export const controls = {
  'Show First Weight Layer': {
    onButtonClick: () => {
      if (!loadedModel) {
        console.warn('Model not loaded yet');
        return;
      }
      if (nodeWeightRefs.length === 0) {
        console.warn(
          'No nodes with weight initializers found. Initializers:',
          loadedModel.listInitializers(),
        );
        return;
      }
      console.log('[AI Example] Loaded model nodes:', loadedModel.getNodes());
      const first = nodeWeightRefs[0];
      const tensors = first.weightNames
        .map((n) => loadedModel!.getTensor(n))
        .filter((t): t is NonNullable<typeof t> => t != null);
      const summary = tensors.map((t) => ({
        name: t.name,
        dims: t.dims,
        elements: t.elementCount,
        sample: sampleTensorData(t.data, 8),
      }));
      console.log(
        '[AI Example] First weight-bearing node index',
        first.index,
        'tensors:',
        summary,
      );
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
