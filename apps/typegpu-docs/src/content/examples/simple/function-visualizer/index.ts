import tgpu from 'typegpu';

const input = {
  functions: {
    f: 'sin(x*10)/2',
  },
  interpolationPoins: 27,
};

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

const computeShaderCode = /* wgsl */ `
fn temp(x: f32) -> f32 {
  return ${input.functions.f};
}

@group(0) @binding(0) var<storage, read_write> lineVertices: array<vec2f>;

@compute @workgroup_size(1) fn computePoints(
  @builtin(global_invocation_id) id: vec3u
) {
  let point = (-1.0f + 2.0f/f32(${input.interpolationPoins} - 1) * f32(id.x));
  let value = temp(point);
  lineVertices[id.x] = vec2f(point, value);
}
`;

const computeShaderModule = device.createShaderModule({
  label: 'Compute shader module',
  code: computeShaderCode,
});

const computePipeline = device.createComputePipeline({
  label: 'point computation pipeline',
  layout: 'auto',
  compute: {
    module: computeShaderModule,
  },
});

const lineVerticesBuffer = device.createBuffer({
  label: 'line vertices buffer',
  size: input.interpolationPoins * 4 * 2,
  usage: GPUBufferUsage.STORAGE,
});

const bindGroup = device.createBindGroup({
  label: 'bindGroup for work buffer',
  layout: computePipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: lineVerticesBuffer } }],
});

const encoder = device.createCommandEncoder({
  label: 'doubling encoder',
});
const pass = encoder.beginComputePass({
  label: 'doubling compute pass',
});
pass.setPipeline(computePipeline);
pass.setBindGroup(0, bindGroup);
pass.dispatchWorkgroups(input.interpolationPoins);
pass.end();

const commandBuffer = encoder.finish();
device.queue.submit([commandBuffer]);

// buffor do którego piszemy pozycje w compute
// w vs obliczamy pozycje wierzchołków

const vertexFraxmentShaderCode = /* wgsl */ `
@group(0) @binding(0) var<storage, read> lineVertices: array<vec2f>;

@vertex fn vs(
  @builtin(vertex_index) vertexIndex : u32
) -> @builtin(position) vec4f {

  return vec4f(lineVertices[vertexIndex], 0.0, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  return vec4f(1, 0, 0, 1);
}
`;

const vertexFraxmentShaderModule = device.createShaderModule({
  label: 'Render module',
  code: vertexFraxmentShaderCode,
});

const renderPipeline = device.createRenderPipeline({
  label: 'Render pipeline',
  layout: 'auto',
  vertex: {
    module: vertexFraxmentShaderModule,
  },
  fragment: {
    module: vertexFraxmentShaderModule,
    targets: [{ format: presentationFormat }],
  },
  primitive: {
    topology: 'line-strip',
  },
});

const renderBindGroup = device.createBindGroup({
  label: 'bindGroup for work buffer',
  layout: renderPipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: lineVerticesBuffer } }],
});

const renderPassDescriptor = {
  label: 'Render pass',
  colorAttachments: [
    {
      view: undefined as unknown as GPUTextureView,
      clearValue: [0.3, 0.3, 0.3, 1] as const,
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    },
  ],
};

function render() {
  // Get the current texture from the canvas context and
  // set it as the texture to render to.
  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  // make a command encoder to start encoding commands
  const encoder = device.createCommandEncoder({ label: 'our encoder ' });

  // make a render pass encoder to encode render specific commands
  const pass = encoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, renderBindGroup);
  pass.draw(input.interpolationPoins); // call our vertex shader 3 times.
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

render();

export function onCleanup() {
  root.destroy();
}

// #endregion
