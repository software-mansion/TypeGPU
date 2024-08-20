import { wgsl, createRuntime, builtin } from 'typegpu';
import { addElement, onFrame } from '@typegpu/example-toolkit';

const runtime = await createRuntime();
const device = runtime.device;

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const pipeline = runtime.makeRenderPipeline({
  vertex: {
    code: wgsl`
      var verticies = array<vec2f, 3>(
        vec2(0.0, 0.5),
        vec2(-0.5, -0.5),
        vec2(0.5, -0.5)
      );

      let pos = vec4f(verticies[${builtin.vertexIndex}], 0.0, 1.0);
    `,
    output: {
      [builtin.position]: 'pos',
    },
  },
  fragment: {
    code: wgsl`
      return vec4(0.7686, 0.3922, 1., 1.0);
    `,
    target: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

onFrame(() => {
  pipeline.execute({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
    vertexCount: 3,
  });

  runtime.flush();
});
