import tgpu from 'typegpu';

// const fRaw = 'x + 1';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const shaderCode = /* wgsl */ `
@vertex fn vs(
  @builtin(vertex_index) vertexIndex : u32
) -> @builtin(position) vec4f {
  let pos = array(
    vec2f( 0.0,  0.5),  // top center
    vec2f(-0.5, -0.5),  // bottom left
    vec2f( 0.5, -0.5)   // bottom right
  );

  return vec4f(pos[vertexIndex], 0.0, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  return vec4f(1, 0, 0, 1);
}
`;

const shaderModule = device.createShaderModule({ code: shaderCode });

const pipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [],
  }),
  vertex: {
    module: shaderModule,
  },
  fragment: {
    module: shaderModule,
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-strip',
  },
});

function draw(spanXValue: number, spanYValue: number) {
  const textureView = context.getCurrentTexture().createView();
  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.draw(3);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
}

let spanX = 10;
let spanY = 10;

// deferring to wait for canvas to init
setTimeout(() => {
  draw(spanX, spanY);
}, 100);

// #region Example controls and cleanup

export const controls = {
  'x span ↔️': {
    initial: spanY,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue: number) => {
      spanX = newValue;
      draw(spanX, spanY);
    },
  },

  'y span ↕️': {
    initial: spanY,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue: number) => {
      spanY = newValue;
      draw(spanX, spanY);
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
