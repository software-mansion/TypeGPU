import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import OnnxModelLoader from '@typegpu/ai';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const shaderCode = tgpu.resolve({
  template: /* wgsl */ `
    @compute @workgroup_size(1)
    fn main() {
      counter += 1;
    }
  `,
  externals: { counter: layout.bound.counter },
});

const root = await tgpu.init();
const device = root.device;

const pipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(layout)],
  }),
  compute: {
    module: device.createShaderModule({ code: shaderCode }),
  },
});

const counterBuffer = root.createBuffer(d.u32, 0).$usage('storage');
const bindGroup = root.createBindGroup(layout, {
  counter: counterBuffer,
});

// --- ONNX model load test -------------------------------------------------
// We fully await the loader, then perform some sanity checks to ensure decoding worked.
let loadedModel: Awaited<ReturnType<typeof OnnxModelLoader.fromPath>> | undefined;
let nodeWeightRefs: { index: number; weightNames: string[] }[] = [];

async function testModelLoad() {
  const MODEL_PATH = '/TypeGPU/assets/model.onnx';
  try {
    const loader = await OnnxModelLoader.fromPath(MODEL_PATH);
    loadedModel = loader;
    const initSet = new Set(loader.listInitializers());
    nodeWeightRefs = loader.getNodes().map((n, idx) => ({
      index: idx,
      weightNames: n.inputs.filter(i => initSet.has(i)),
    })).filter(e => e.weightNames.length > 0);
    // Basic invariants: have original buffer and graph object.
    const inputNames = loader.getInputNames();
    const outputNames = loader.getOutputNames();
    const initNames = loader.listInitializers();
    if (!loader.buffer?.byteLength) {
      throw new Error('Empty model buffer');
    }
    if (inputNames.length === 0 && initNames.length === 0) {
      // Not necessarily fatal for all models, but flag as suspicious in this example.
      console.warn('[AI Example] Model loaded but has no inputs and no initializers.');
    }
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
  Increment: {
    onButtonClick: async () => {
      const encoder = device.createCommandEncoder();

      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, root.unwrap(bindGroup));
      pass.dispatchWorkgroups(1);
      pass.end();

      device.queue.submit([encoder.finish()]);

      const result = await counterBuffer.read();
      table.innerText = `${result}`;
    },
  },
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
  'Show Layer Index Weights': {
    onButtonClick: () => {
      if (!loadedModel) { console.warn('Model not loaded yet'); return; }
      const idx = prompt('Enter node index (0-based):');
      if (idx == null) return;
      const nIdx = Number(idx);
      if (!Number.isInteger(nIdx) || nIdx < 0) { console.warn('Invalid index'); return; }
      const entry = nodeWeightRefs.find(e => e.index === nIdx);
      if (!entry) { console.warn('Node has no weight initializers or out of range'); return; }
      const tensors = entry.weightNames
        .map(n => loadedModel!.getTensor(n))
        .filter((t): t is NonNullable<typeof t> => t != null);
      const summary = tensors.map(t => ({
        name: t.name,
        dims: t.dims,
        elements: t.elementCount,
        sample: sampleTensorData(t.data, 8),
      }));
      console.log('[AI Example] Node', nIdx, 'weight tensors:', summary);
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
