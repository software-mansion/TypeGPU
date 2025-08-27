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
async function testModelLoad() {
  const MODEL_PATH = '/TypeGPU/assets/model.onnx';
  try {
    const loader = await OnnxModelLoader.fromPath(MODEL_PATH);
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
};

export function onCleanup() {
  root.destroy();
}
