import tgpu, { type TgpuBuffer, type Storage, type Uniform } from 'typegpu';
import * as d from 'typegpu/data';
import { mat4 } from 'wgpu-matrix';

// #region Globals and init

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

const initialFunctions: Array<{ name: string; color: d.v4f; code: string }> = [
  {
    name: 'Red function',
    color: d.vec4f(1.0, 0.0, 0.0, 1.0),
    code: 'x',
  },
  {
    name: 'Blue function',
    color: d.vec4f(0.0, 1.0, 0.0, 1.0),
    code: 'cos(x*5)/3-x',
  },
  {
    name: 'Green function',
    color: d.vec4f(0.0, 0.0, 1.0, 1.0),
    code: 'x*sin(log(abs(x)))',
  },
];

const PropertiesSchema = d.struct({
  transformation: d.mat4x4f,
  inverseTransformation: d.mat4x4f,
  interpolationPoints: d.u32,
  lineWidth: d.f32,
  dashedLine: d.u32,
});

const properties: d.Infer<typeof PropertiesSchema> = {
  transformation: mat4.identity(d.mat4x4f()),
  inverseTransformation: mat4.identity(d.mat4x4f()),
  interpolationPoints: 256,
  lineWidth: 0.01,
  dashedLine: 0,
};

// #region Buffers

const propertiesBuffer = root
  .createBuffer(PropertiesSchema, properties)
  .$usage('uniform');

type LineVerticesBuffer = TgpuBuffer<d.WgslArray<d.Vec2f>> & Storage;
let lineVerticesBuffers: Array<LineVerticesBuffer> =
  createLineVerticesBuffers();

type DrawColorBuffer = TgpuBuffer<d.Vec4f> & Uniform;
const drawColorBuffers: Array<DrawColorBuffer> = createColorBuffers();

// #region Compute shader

const computeLayout = tgpu.bindGroupLayout({
  lineVertices: {
    storage: (n: number) => d.arrayOf(d.vec2f, n),
    access: 'mutable',
  },
  properties: { uniform: PropertiesSchema },
});

function createComputeShaderCode(functionCode: string) {
  const rawComputeCode = /* wgsl */ `
fn interpolatedFunction(x: f32) -> f32 {
  return ${functionCode};
}
@compute @workgroup_size(1) fn computePoints(@builtin(global_invocation_id) id: vec3u) {
  let start = (properties.transformation * vec4f(-1, 0, 0, 1)).x;
  let end = (properties.transformation * vec4f(1, 0, 0, 1)).x;

  let pointX = (start + (end-start)/(f32(properties.interpolationPoints)-1.0) * f32(id.x));
  let pointY = interpolatedFunction(pointX);
  let result = properties.inverseTransformation * vec4f(pointX, pointY, 0, 1);
  lineVertices[id.x] = result.xy;
}
  `;
  return tgpu.resolve({
    template: rawComputeCode,
    externals: {
      ...computeLayout.bound,
    },
  });
}

const computePipelines: Array<GPUComputePipeline> = [];
for (const functionData of initialFunctions) {
  const computeShaderCode = createComputeShaderCode(functionData.code);
  const computeShaderModule = device.createShaderModule({
    label: `Compute function points shader module for f(x) = ${functionData.code}`,
    code: computeShaderCode,
  });

  const computePipeline = device.createComputePipeline({
    label: 'Compute function points pipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(computeLayout)],
    }),
    compute: {
      module: computeShaderModule,
    },
  });

  computePipelines.push(computePipeline);
}

// #region Render background shader

const renderBackgroundLayout = tgpu.bindGroupLayout({
  properties: { uniform: PropertiesSchema },
});

const rawRenderBackgroundCode = /* wgsl */ `
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

  let currentPoint = properties.inverseTransformation * vec4f(transformedPoints[2 * instanceIndex + vertexIndex/2].xy, 0, 1);
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

const renderBackgroundCode = tgpu.resolve({
  template: rawRenderBackgroundCode,
  externals: {
    ...renderBackgroundLayout.bound,
  },
});

const renderBackgroundModule = device.createShaderModule({
  label: 'Render module',
  code: renderBackgroundCode,
});

const renderBackgroundPipeline = device.createRenderPipeline({
  label: 'Render pipeline',
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(renderBackgroundLayout)],
  }),
  vertex: {
    module: renderBackgroundModule,
  },
  fragment: {
    module: renderBackgroundModule,
    targets: [{ format: presentationFormat }],
  },
  primitive: {
    topology: 'triangle-strip',
  },
});

// #region Render shader

const renderLayout = tgpu.bindGroupLayout({
  lineVertices: { storage: (n: number) => d.arrayOf(d.vec2f, n) },
  properties: { uniform: PropertiesSchema },
  color: { uniform: d.vec4f },
});

const rawRenderCode = /* wgsl */ `
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

const renderCode = tgpu.resolve({
  template: rawRenderCode,
  externals: {
    ...renderLayout.bound,
  },
});

const renderModule = device.createShaderModule({
  label: 'Render module',
  code: renderCode,
});

const renderPipeline = device.createRenderPipeline({
  label: 'Render pipeline',
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(renderLayout)],
  }),
  vertex: {
    module: renderModule,
  },
  fragment: {
    module: renderModule,
    targets: [{ format: presentationFormat }],
  },
  primitive: {
    topology: 'triangle-strip',
  },
});

// #region Draw

let destroyed = false;
function draw() {
  if (destroyed) {
    return;
  }

  queuePropertiesBufferUpdate();

  initialFunctions.forEach((_, i) => {
    runComputePass(i);
  });
  runRenderBackgroundPass();
  runRenderPass();

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

function runComputePass(functionNumber: number) {
  const computePipeline = computePipelines[functionNumber];

  const bindGroup = root.createBindGroup(computeLayout, {
    lineVertices: lineVerticesBuffers[functionNumber],
    properties: propertiesBuffer,
  });

  const encoder = device.createCommandEncoder({
    label: 'Compute function points encoder',
  });

  const pass = encoder.beginComputePass({
    label: 'Compute function points compute pass',
  });
  pass.setPipeline(computePipeline);
  pass.setBindGroup(0, root.unwrap(bindGroup));
  pass.dispatchWorkgroups(properties.interpolationPoints);
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

function runRenderBackgroundPass() {
  const renderBindGroup = root.createBindGroup(renderBackgroundLayout, {
    properties: propertiesBuffer,
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
  pass.setPipeline(renderBackgroundPipeline);
  pass.setBindGroup(0, root.unwrap(renderBindGroup));
  pass.draw(4, 2);
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

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

  initialFunctions.forEach((_, i) => {
    const renderBindGroup = root.createBindGroup(renderLayout, {
      lineVertices: lineVerticesBuffers[i],
      properties: propertiesBuffer,
      color: drawColorBuffers[i],
    });
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, root.unwrap(renderBindGroup));
    // call our vertex shader 2 times per point drawn
    pass.draw(properties.interpolationPoints * 2);
  });
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

// #region Helper definitions

async function tryRecreateComputePipeline(
  functionCode: string,
): Promise<GPUComputePipeline> {
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

  const computePipeline = device.createComputePipeline({
    label: 'Compute function points pipeline',
    layout: device.createPipelineLayout({
      bindGroupLayouts: [root.unwrap(computeLayout)],
    }),
    compute: {
      module: computeShaderModule,
    },
  });

  return computePipeline;
}

function createLineVerticesBuffers() {
  const Scheme = d.arrayOf(d.vec2f, properties.interpolationPoints);
  const lineVerticesBuffers: Array<LineVerticesBuffer> = [];

  for (const _ in initialFunctions) {
    const buffer = root.createBuffer(Scheme).$usage('storage');
    lineVerticesBuffers.push(buffer);
  }
  return lineVerticesBuffers;
}

function createColorBuffers() {
  const Scheme = d.vec4f;
  const colorBuffers: DrawColorBuffer[] = [];
  for (const functionData of initialFunctions) {
    const buffer = root
      .createBuffer(Scheme, functionData.color)
      .$usage('uniform');
    colorBuffers.push(buffer);
  }
  return colorBuffers;
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
  [initialFunctions[0].name]: {
    initial: initialFunctions[0].code,
    onTextChange: async (value: string) => {
      try {
        computePipelines[0] = await tryRecreateComputePipeline(value);
      } catch (e) {
        console.log(e);
      }
    },
  },
  [initialFunctions[1].name]: {
    initial: initialFunctions[1].code,
    onTextChange: async (value: string) => {
      try {
        computePipelines[1] = await tryRecreateComputePipeline(value);
      } catch (e) {
        console.log(e);
      }
    },
  },
  [initialFunctions[2].name]: {
    initial: initialFunctions[2].code,
    onTextChange: async (value: string) => {
      try {
        computePipelines[2] = await tryRecreateComputePipeline(value);
      } catch (e) {
        console.log(e);
      }
    },
  },
  'Line width': {
    initial: 0.01,
    min: 0.0,
    max: 0.025,
    step: 0.001,
    onSliderChange: (value: number) => {
      properties.lineWidth = value;
    },
  },
  'Interpolation points count': {
    initial: '256',
    options: [4, 16, 64, 256, 1024, 4096].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      const num = Number.parseInt(value);
      properties.interpolationPoints = num;

      const oldBuffers = lineVerticesBuffers;
      lineVerticesBuffers = createLineVerticesBuffers();
      oldBuffers.forEach((buffer, _) => {
        buffer.destroy();
      });
    },
  },
  Recenter: {
    onButtonClick: async () => {
      properties.transformation = mat4.identity();
    },
  },
};

export function onCleanup() {
  destroyed = true;
  root.destroy();
}

// #endregion
