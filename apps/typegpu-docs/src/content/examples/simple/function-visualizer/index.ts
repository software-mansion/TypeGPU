import tgpu from 'typegpu';
import { mat4 } from 'wgpu-matrix';

// #region Globals and init

type FunctionDef = {
  code: string;
  color: Float32Array;
};

const initialFunctions: Record<string, FunctionDef> = {
  f: {
    code: 'sin(x*10)/2',
    color: Float32Array.of(1.0, 0.0, 0.0, 1.0),
  },
  g: {
    code: '0.1 * x * x - 0.5',
    color: Float32Array.of(0.0, 1.0, 0.0, 1.0),
  },
  h: {
    code: '(x+0.1) * x * (x-0.1) * 0.01',
    color: Float32Array.of(0.0, 0.0, 1.0, 1.0),
  },
};

const properties = {
  transformation: mat4.identity(),
  inverseTransformation: mat4.identity(),
  interpolationPoints: 256,
  lineWidthBuffer: 0.01,
  dashedLine: 0,
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

const modules: Record<string, GPUShaderModule> = {
  f: recompileComputeModule(initialFunctions.f.code),
  g: recompileComputeModule(initialFunctions.g.code),
  h: recompileComputeModule(initialFunctions.h.code),
  draw: recompileRenderModule(),
};

const buffers: Record<string, GPUBuffer> = {
  properties: device.createBuffer({
    label: 'properties buffer',
    size:
      4 * 4 * 4 + // transformation
      4 * 4 * 4 + // inverseTransformation
      4 + // interpolationPoints
      4 + // lineWidthBuffer
      4 + // dashedLine
      4, // padding
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  }),
  lineVertices: recreateLineVerticesBuffer(),
  color: device.createBuffer({
    label: 'properties buffer',
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  }),
};

// deferring to wait for canvas to init
setTimeout(() => {
  draw();
}, 100);

async function draw() {
  queuePropertiesBufferUpdate();

  for (const fn in initialFunctions) {
    const { color } = initialFunctions[fn];

    runComputePass(modules[fn]);

    device.queue.writeBuffer(buffers.color, 0, color.buffer);

    runRenderPass();
  }
}

// #region function definitions

function runComputePass(module: GPUShaderModule) {
  const computePipeline = device.createComputePipeline({
    label: 'Compute function points pipeline',
    layout: 'auto',
    compute: {
      module: module,
    },
  });

  const bindGroup = device.createBindGroup({
    label: 'Compute function points bind group',
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.lineVertices } },
      { binding: 1, resource: { buffer: buffers.properties } },
    ],
  });

  const encoder = device.createCommandEncoder({
    label: 'Compute function points encoder',
  });
  const pass = encoder.beginComputePass({
    label: 'Compute function points compute pass',
  });
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(properties.interpolationPoints);
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

function runRenderPass() {
  const renderPipeline = device.createRenderPipeline({
    label: 'Render pipeline',
    layout: 'auto',
    vertex: {
      module: modules.draw,
    },
    fragment: {
      module: modules.draw,
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  const renderBindGroup = device.createBindGroup({
    label: 'Render bindGroup',
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: buffers.lineVertices } },
      { binding: 1, resource: { buffer: buffers.properties } },
      { binding: 2, resource: { buffer: buffers.color } },
    ],
  });

  const renderPassDescriptor = {
    label: 'Render pass',
    colorAttachments: [
      {
        view: undefined as unknown as GPUTextureView,
        clearValue: [0.3, 0.3, 0.3, 1] as const,
        loadOp: 'load' as const,
        storeOp: 'store' as const,
      },
    ],
  };

  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const encoder = device.createCommandEncoder({ label: 'Render encoder' });

  const pass = encoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, renderBindGroup);
  pass.draw(properties.interpolationPoints * 2); // call our vertex shader 2 times per point drawn
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

function recompileComputeModule(functionCode: string) {
  const computeShaderCode = /* wgsl */ `
fn interpolatedFunction(x: f32) -> f32 {
return ${functionCode};
}

struct Properties {
  transformation: mat4x4f,
  invertedTransformation: mat4x4f,
  interpolationPoints: u32,
  lineWidthBuffer: f32,
  dashedLine: u32,
};

@group(0) @binding(0) var<storage, read_write> lineVertices: array<vec2f>;
@group(0) @binding(1) var<uniform> properties: Properties;

@compute @workgroup_size(1) fn computePoints(@builtin(global_invocation_id) id: vec3u) {
  let start = (properties.transformation * vec4f(-1, 0, 0, 1)).x;
  let end = (properties.transformation * vec4f(1, 0, 0, 1)).x;

  let pointX = (start + (end-start)/(f32(properties.interpolationPoints)-1.0) * f32(id.x));
  let pointY = interpolatedFunction(pointX);
  let result = properties.invertedTransformation * vec4f(pointX, pointY, 0, 1);
  lineVertices[id.x] = result.xy;
}
`;
  const computeShaderModule = device.createShaderModule({
    label: `Compute function points shader module for f(x) = ${functionCode}`,
    code: computeShaderCode,
  });
  return computeShaderModule;
}

function recompileRenderModule() {
  const vertexFragmentShaderCode = /* wgsl */ `
struct Properties {
  transformation: mat4x4f,
  invertedTransformation: mat4x4f,
  interpolationPoints: u32,
  lineWidth: f32,
  dashedLine: u32,
};

@group(0) @binding(0) var<storage, read> lineVertices: array<vec2f>;
@group(0) @binding(1) var<uniform> properties: Properties;
@group(0) @binding(2) var<uniform> color: vec4f;

fn othronormalForLine(p1: vec2f, p2: vec2f) -> vec2f {
  let line = p2 - p1;
  let ortho = vec2f(-line.y, line.x);
  return normalize(ortho);
}

fn orthonormalForVertex(index: u32) -> vec2f {
  if (index == 0 || index == properties.interpolationPoints-1) {
    return vec2f(0.0, 1.0);
  }
  let previous = lineVertices[index-1];
  let current = lineVertices[index];
  let next = lineVertices[index+1];

  let n1 = othronormalForLine(previous, current);
  let n2 = othronormalForLine(current, next);

  let avg = (n1+n2)/2.0;

  return normalize(avg);
}

@vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
  let currentVertex = vertexIndex/2;
  let orthonormal = orthonormalForVertex(currentVertex);
  let offset = orthonormal * properties.lineWidth * select(-1.0, 1.0, vertexIndex%2==0);
  return vec4f(lineVertices[currentVertex] + offset, 0.0, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  return color;
}
  `;

  const vertexFragmentShaderModule = device.createShaderModule({
    label: 'Render module',
    code: vertexFragmentShaderCode,
  });

  return vertexFragmentShaderModule;
}

function recreateLineVerticesBuffer() {
  const lineVerticesBuffer = device.createBuffer({
    label: 'Function points buffer',
    size: properties.interpolationPoints * 4 * 2,
    usage: GPUBufferUsage.STORAGE,
  });
  return lineVerticesBuffer;
}

function queuePropertiesBufferUpdate() {
  const transformationOffset = 0;
  const inverseTransformationOffset = 16 * 4;
  const interpolationPointsOffset = 32 * 4;
  const lineWidthBufferOffset = 33 * 4;
  const dashedLineOffset = 34 * 4;

  properties.inverseTransformation = mat4.inverse(properties.transformation);

  device.queue.writeBuffer(
    buffers.properties,
    transformationOffset,
    properties.transformation.buffer,
  );
  device.queue.writeBuffer(
    buffers.properties,
    inverseTransformationOffset,
    properties.inverseTransformation.buffer,
  );
  device.queue.writeBuffer(
    buffers.properties,
    interpolationPointsOffset,
    Int32Array.of(properties.interpolationPoints).buffer,
  );
  device.queue.writeBuffer(
    buffers.properties,
    lineWidthBufferOffset,
    Float32Array.of(properties.lineWidthBuffer).buffer,
  );
  device.queue.writeBuffer(
    buffers.properties,
    dashedLineOffset,
    Int32Array.of(properties.dashedLine).buffer,
  );
}

// #region canvas controls

let lastPos: number[] | null = null;

canvas.onmousedown = (event) => {
  lastPos = [event.offsetX, event.offsetY];
};

canvas.onmouseup = (_) => {
  lastPos = null;
};

canvas.onmousemove = (event) => {
  if (lastPos == null) {
    return;
  }
  const currentPos = [event.offsetX, event.offsetY];
  const translation = [
    (-(currentPos[0] - lastPos[0]) / canvas.width) *
      2.0 *
      window.devicePixelRatio,
    ((currentPos[1] - lastPos[1]) / canvas.height) *
      2.0 *
      window.devicePixelRatio,
    0.0,
  ];
  mat4.translate(
    properties.transformation,
    translation,
    properties.transformation,
  );

  lastPos = currentPos;
  draw();
};

canvas.onwheel = (event) => {
  event.preventDefault();

  const delta = Math.abs(event.deltaY) / 1000.0 + 1;
  const scale = event.deltaY > 0 ? delta : 1 / delta;

  mat4.scale(
    properties.transformation,
    [scale, scale, 1],
    properties.transformation,
  );
  draw();
};

// #region Example controls

export const controls = {
  'line width': {
    initial: 0.01,
    min: 0.0,
    max: 0.025,
    step: 0.001,
    onSliderChange: (value: number) => {
      properties.lineWidthBuffer = value;
      draw();
    },
  },
  'interpolation points count': {
    initial: '256',
    options: [4, 16, 64, 256, 1024, 4096].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      const num = Number.parseInt(value);
      properties.interpolationPoints = num;
      buffers.lineVertices = recreateLineVerticesBuffer();
      draw();
    },
  },
  'red function': {
    initial: initialFunctions.f.code,
    onTextChange: (value: string) => {
      modules.f = recompileComputeModule(value);
      draw();
    },
  },
  'green function': {
    initial: initialFunctions.g.code,
    onTextChange: (value: string) => {
      modules.g = recompileComputeModule(value);
      draw();
    },
  },
  'blue function': {
    initial: initialFunctions.h.code,
    onTextChange: (value: string) => {
      modules.h = recompileComputeModule(value);
      draw();
    },
  },
};

// #endregion
