import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const Span = d.struct({
  x: d.u32,
  y: d.u32,
});

// A description of what data our shader program
// needs from the outside.
const layout = tgpu
  .bindGroupLayout({
    span: { uniform: Span },
  })
  .$idx(0);

const shaderCode = tgpu.resolve({
  template: /* wgsl */ `
    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) uv: vec2f,
    }

    @vertex
    fn main_vertex(
      @builtin(vertex_index) vertexIndex: u32,
    ) -> VertexOutput {
      var pos = array<vec2f, 4>(
        vec2(1, 1), // top-right
        vec2(-1, 1), // top-left
        vec2(1, -1), // bottom-right
        vec2(-1, -1) // bottom-left
      );
      var out: VertexOutput;
      out.pos = vec4f(pos[vertexIndex], 0.0, 1.0);
      out.uv = (pos[vertexIndex] + 1) * 0.5;
      return out;
    }

    @fragment
    fn main_fragment(
      @location(0) uv: vec2f,
    ) -> @location(0) vec4f {
      let red = floor(uv.x * f32(_EXT_.span.x)) / f32(_EXT_.span.x);
      let green = floor(uv.y * f32(_EXT_.span.y)) / f32(_EXT_.span.y);
      return vec4(red, green, 0.5, 1.0);
    }
  `,
  externals: {
    // Linking the shader template with our layout
    _EXT_: { span: layout.bound.span },
  },
});

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

const shaderModule = device.createShaderModule({ code: shaderCode });

const pipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(layout)],
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

const spanBuffer = root.createBuffer(Span, { x: 10, y: 10 }).$usage('uniform');

const bindGroup = root.createBindGroup(layout, {
  span: spanBuffer,
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

  spanBuffer.write({ x: spanXValue, y: spanYValue });

  const commandEncoder = device.createCommandEncoder();
  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setBindGroup(0, root.unwrap(bindGroup));
  passEncoder.draw(4);
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
