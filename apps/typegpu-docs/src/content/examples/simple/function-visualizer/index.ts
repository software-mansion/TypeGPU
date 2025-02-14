import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { mat4 } from 'wgpu-matrix';

// #region Globals and init

type FunctionDef = {
  code: string;
  color: Float32Array;
};

const initialFunctions: Record<string, FunctionDef> = {
  f: {
    code: 'x',
    color: Float32Array.of(1.0, 0.0, 0.0, 1.0),
  },
  g: {
    code: 'cos(x*5)/3-x',
    color: Float32Array.of(0.0, 0.8, 0.0, 1.0),
  },
  h: {
    code: 'x*sin(log(abs(x)))',
    color: Float32Array.of(0.0, 0.0, 1.0, 1.0),
  },
};

const PropertiesSchema = d.struct({
  transformation: d.mat4x4f,
  inverseTransformation: d.mat4x4f,
  interpolationPoints: d.u32,
  lineWidthBuffer: d.f32,
  dashedLine: d.u32,
});

const properties: d.Infer<typeof PropertiesSchema> = {
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
  f: compileComputeModule(initialFunctions.f.code),
  g: compileComputeModule(initialFunctions.g.code),
  h: compileComputeModule(initialFunctions.h.code),
  background: compileBackgroundRenderModule(),
  draw: compileRenderModule(),
};

const propertiesBuffer = root
  .createBuffer(PropertiesSchema, properties)
  .$usage('uniform');

const lineVerticesBuffers: Record<string, GPUBuffer> =
  recreateLineVerticesBuffers();

const colorBuffers: Record<string, GPUBuffer> = {
  f: recreateColorBuffer(initialFunctions.f.color),
  g: recreateColorBuffer(initialFunctions.g.color),
  h: recreateColorBuffer(initialFunctions.h.color),
};

let destroyed = false;
function draw() {
  if (destroyed) {
    return;
  }

  queuePropertiesBufferUpdate();

  for (const fn in initialFunctions) {
    runComputePass(modules[fn], lineVerticesBuffers[fn]);
  }
  runRenderBackgroundPass();
  runRenderPass();

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

// #region Function definitions

function runComputePass(module: GPUShaderModule, resultBuffer: GPUBuffer) {
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
      { binding: 0, resource: { buffer: resultBuffer } },
      { binding: 1, resource: { buffer: root.unwrap(propertiesBuffer) } },
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

function runRenderBackgroundPass() {
  const renderPipeline = device.createRenderPipeline({
    label: 'Render pipeline',
    layout: 'auto',
    vertex: {
      module: modules.background,
    },
    fragment: {
      module: modules.background,
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  const renderPassDescriptor = {
    label: 'Render pass',
    colorAttachments: [
      {
        view: undefined as unknown as GPUTextureView,
        clearValue: [1.0, 1.0, 1.0, 1] as const,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
      },
    ],
  };

  renderPassDescriptor.colorAttachments[0].view = context
    .getCurrentTexture()
    .createView();

  const encoder = device.createCommandEncoder({ label: 'Render encoder' });

  const pass = encoder.beginRenderPass(renderPassDescriptor);

  const renderBindGroup = device.createBindGroup({
    label: 'Render bindGroup',
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: root.unwrap(propertiesBuffer) } },
    ],
  });
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, renderBindGroup);
  pass.draw(4, 2);
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

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

function runRenderPass() {
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

  for (const fn in initialFunctions) {
    const renderBindGroup = device.createBindGroup({
      label: 'Render bindGroup',
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: lineVerticesBuffers[fn] } },
        { binding: 1, resource: { buffer: root.unwrap(propertiesBuffer) } },
        { binding: 2, resource: { buffer: colorBuffers[fn] } },
      ],
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderBindGroup);
    pass.draw(properties.interpolationPoints * 2); // call our vertex shader 2 times per point drawn
  }
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

function createComputeShaderCode(functionCode: string) {
  return /* wgsl */ `
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
}

function compileComputeModule(functionCode: string) {
  const computeShaderCode = createComputeShaderCode(functionCode);
  const computeShaderModule = device.createShaderModule({
    label: `Compute function points shader module for f(x) = ${functionCode}`,
    code: computeShaderCode,
  });
  return computeShaderModule;
}

async function tryCompileComputeModule(
  functionCode: string,
): Promise<GPUShaderModule> {
  const codeToCompile = functionCode === '' ? '0' : functionCode;

  const computeShaderCode = createComputeShaderCode(codeToCompile);

  device.pushErrorScope('validation');
  const computeShaderModule = device.createShaderModule({
    label: `Compute function points shader module for f(x) = ${codeToCompile}`,
    code: computeShaderCode,
  });
  const error = await device.popErrorScope();

  if (error) {
    throw new Error(`Function f(x) = '${codeToCompile}' is invalid.`);
  }

  return computeShaderModule;
}

function compileBackgroundRenderModule() {
  const renderBackgroundCode = /* wgsl */ `
struct Properties {
  transformation: mat4x4f,
  invertedTransformation: mat4x4f,
  interpolationPoints: u32,
  lineWidthBuffer: f32,
  dashedLine: u32,
};

@group(0) @binding(0) var<uniform> properties: Properties;

@vertex fn vs(
  @builtin(vertex_index) vertexIndex : u32,
  @builtin(instance_index) instanceIndex : u32,
) -> @builtin(position) vec4f {
  let leftBot = properties.transformation * vec4f(-1, -1, 0, 1);
  let rightTop = properties.transformation * vec4f(1, 1, 0, 1);

  let transformedPoints = array(
    vec2f(leftBot.x, 0.0),
    vec2f(rightTop.x, 0.0),
    vec2f(0.0, leftBot.y),
    vec2f(0.0, rightTop.y),
  );

  let currentPoint = properties.invertedTransformation * vec4f(transformedPoints[2 * instanceIndex + vertexIndex/2].xy, 0, 1);
  return vec4f(
    currentPoint.x + f32(instanceIndex) * select(-1.0, 1.0, vertexIndex%2 == 0) * 0.005,
    currentPoint.y + f32(1-instanceIndex) * select(-1.0, 1.0, vertexIndex%2 == 0) * 0.005,
    currentPoint.zw
  );
}

@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.9, 0.9, 0.9, 1.0);
}
  `;
  const renderBackgroundModule = device.createShaderModule({
    label: 'Render module',
    code: renderBackgroundCode,
  });
  return renderBackgroundModule;
}

function compileRenderModule() {
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

function recreateLineVerticesBuffers() {
  const Scheme = d.arrayOf(d.vec2f, properties.interpolationPoints);
  const buffers: Record<string, GPUBuffer> = {
    f: undefined as unknown as GPUBuffer,
    g: undefined as unknown as GPUBuffer,
    h: undefined as unknown as GPUBuffer,
  };
  for (const fn in initialFunctions) {
    const buffer = root.createBuffer(Scheme).$usage('storage');
    buffers[fn] = root.unwrap(buffer);
  }
  return buffers;
}

function recreateColorBuffer(color: Float32Array) {
  const colorBuffer = device.createBuffer({
    label: 'properties buffer',
    size: 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(colorBuffer, 0, color.buffer);
  return colorBuffer;
}

function queuePropertiesBufferUpdate() {
  properties.inverseTransformation = mat4.inverse(properties.transformation);
  propertiesBuffer.write(properties);
}

// #region Canvas controls

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
};

// #region Example controls and cleanup

export const controls = {
  'line width': {
    initial: 0.01,
    min: 0.0,
    max: 0.025,
    step: 0.001,
    onSliderChange: (value: number) => {
      properties.lineWidthBuffer = value;
    },
  },
  'interpolation points count': {
    initial: '256',
    options: [4, 16, 64, 256, 1024, 4096].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      const num = Number.parseInt(value);
      properties.interpolationPoints = num;
      recreateLineVerticesBuffers();
    },
  },
  'red function': {
    initial: initialFunctions.f.code,
    onTextChange: async (value: string) => {
      try {
        modules.f = await tryCompileComputeModule(value);
      } catch (e) {
        console.log(e);
      }
    },
  },
  'green function': {
    initial: initialFunctions.g.code,
    onTextChange: async (value: string) => {
      try {
        modules.g = await tryCompileComputeModule(value);
      } catch (e) {
        console.log(e);
      }
    },
  },
  'blue function': {
    initial: initialFunctions.h.code,
    onTextChange: async (value: string) => {
      try {
        modules.h = await tryCompileComputeModule(value);
      } catch (e) {
        console.log(e);
      }
    },
  },
};

export function onCleanup() {
  destroyed = true;
  root.destroy();
}

// #endregion
