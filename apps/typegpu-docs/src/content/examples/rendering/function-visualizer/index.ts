import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { mat4 } from 'wgpu-matrix';

// Globals and init

const root = await tgpu.init();
const device = root.device;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const initialFunctions: Array<{ name: string; color: d.v4f; code: string }> = [
  {
    name: 'blue function',
    color: fromHex('#1D72F0'),
    code: 'x',
  },
  {
    name: 'green function',
    color: fromHex('#3CB371'),
    code: 'cos(x*5)/3-x',
  },
  {
    name: 'purple function',
    color: fromHex('#C464FF'),
    code: 'x*sin(log(abs(x)))',
  },
];

const Properties = d.struct({
  transformation: d.mat4x4f,
  inverseTransformation: d.mat4x4f,
  interpolationPoints: d.u32,
  lineWidth: d.f32,
});

const properties = Properties({
  transformation: mat4.identity(d.mat4x4f()),
  inverseTransformation: mat4.identity(d.mat4x4f()),
  interpolationPoints: 256,
  lineWidth: 0.01,
});

// Buffers

const propertiesBuffer = root
  .createBuffer(Properties, properties)
  .$usage('uniform');

// these buffers are recreated with a different size on interpolationPoints change
function createLineVerticesBuffers() {
  const Schema = d.arrayOf(d.vec2f, properties.interpolationPoints);
  return initialFunctions.map(() =>
    root.createBuffer(Schema).$usage('storage')
  );
}
let lineVerticesBuffers = createLineVerticesBuffers();

const drawColorBuffers = initialFunctions.map((data) =>
  root.createBuffer(d.vec4f, data.color).$usage('uniform')
);

// Compute shader

const computeLayout = tgpu.bindGroupLayout({
  lineVertices: {
    storage: (n: number) => d.arrayOf(d.vec2f, n),
    access: 'mutable',
  },
  properties: { uniform: Properties },
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

const computePipelines: Array<GPUComputePipeline> = initialFunctions.map(
  (functionData, _) => {
    const computeShaderCode = createComputeShaderCode(functionData.code);
    const computeShaderModule = device.createShaderModule({
      label:
        `Compute function points shader module for f(x) = ${functionData.code}`,
      code: computeShaderCode,
    });

    return device.createComputePipeline({
      label: 'Compute function points pipeline',
      layout: device.createPipelineLayout({
        bindGroupLayouts: [root.unwrap(computeLayout)],
      }),
      compute: {
        module: computeShaderModule,
      },
    });
  },
);

// Render background shader

const renderBackgroundLayout = tgpu.bindGroupLayout({
  properties: { uniform: Properties },
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
  multisample: {
    count: 4,
  },
});

let msTexture = device.createTexture({
  size: [
    canvas.clientWidth * window.devicePixelRatio,
    canvas.clientHeight * window.devicePixelRatio,
  ],
  sampleCount: 4,
  format: presentationFormat,
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

let msView = msTexture.createView();

const renderBackgroundPassDescriptor = {
  label: 'Render pass',
  colorAttachments: [
    {
      view: msView,
      resolveTarget: context.getCurrentTexture().createView(),
      clearValue: [1.0, 1.0, 1.0, 1] as const,
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    },
  ],
};

// Render shader

const renderLayout = tgpu.bindGroupLayout({
  lineVertices: { storage: (n: number) => d.arrayOf(d.vec2f, n) },
  properties: { uniform: Properties },
  color: { uniform: d.vec4f },
});

const rawRenderCode = /* wgsl */ `
fn orthonormalForLine(p1: vec2f, p2: vec2f) -> vec2f {
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

  let n1 = orthonormalForLine(previous, current);
  let n2 = orthonormalForLine(current, next);

  let avg = (n1+n2)/2.0;

  return normalize(avg);
}

@vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
  let currentVertex = vertexIndex/2;
  let orthonormal = orthonormalForVertex(currentVertex);
  let offset = orthonormal * properties.lineWidth * select(-1.0, 1.0, vertexIndex%2 == 0);
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
  multisample: {
    count: 4,
  },
});

const renderPassDescriptor = {
  label: 'Render pass',
  colorAttachments: [
    {
      view: msView,
      resolveTarget: context.getCurrentTexture().createView(),
      clearValue: [0.3, 0.3, 0.3, 1] as const,
      loadOp: 'load' as const,
      storeOp: 'store' as const,
    },
  ],
};

// Draw

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

  device.queue.submit([encoder.finish()]);
}

function runRenderBackgroundPass() {
  const renderBindGroup = root.createBindGroup(renderBackgroundLayout, {
    properties: propertiesBuffer,
  });

  renderBackgroundPassDescriptor.colorAttachments[0].resolveTarget = context
    .getCurrentTexture()
    .createView();

  const encoder = device.createCommandEncoder({ label: 'Render encoder' });

  const pass = encoder.beginRenderPass(renderBackgroundPassDescriptor);
  pass.setPipeline(renderBackgroundPipeline);
  pass.setBindGroup(0, root.unwrap(renderBindGroup));
  pass.draw(4, 2);
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);
}

function runRenderPass() {
  renderPassDescriptor.colorAttachments[0].resolveTarget = context
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

  device.queue.submit([encoder.finish()]);
}

// Helper definitions

function fromHex(hex: string) {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);

  return d.vec4f(r / 255.0, g / 255.0, b / 255.0, 1.0);
}

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
    throw new Error(`Invalid function f(x) = ${codeToCompile}.`);
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

function queuePropertiesBufferUpdate() {
  properties.inverseTransformation = mat4.inverse(
    properties.transformation,
    d.mat4x4f(),
  );
  propertiesBuffer.write(properties);
}

// Canvas controls
let lastPos: number[] | null = null;

// Mouse interaction

canvas.addEventListener('mousedown', (event) => {
  lastPos = [event.clientX, event.clientY];
});

window.addEventListener('mousemove', (event) => {
  if (lastPos === null) {
    return;
  }
  const currentPos = [event.clientX, event.clientY];
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
});

window.addEventListener('mouseup', (_) => {
  lastPos = null;
});

canvas.addEventListener('wheel', (event) => {
  event.preventDefault();

  const delta = Math.abs(event.deltaY) / 1000.0 + 1;
  const scale = event.deltaY > 0 ? delta : 1 / delta;

  mat4.scale(
    properties.transformation,
    [scale, scale, 1],
    properties.transformation,
  );
});

// Mouse interaction

canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    lastPos = [event.touches[0].clientX, event.touches[0].clientY];
  }
});

window.addEventListener('touchmove', (event) => {
  if (lastPos === null || event.touches.length !== 1) {
    return;
  }
  const currentPos = [event.touches[0].clientX, event.touches[0].clientY];
  const s = 2.0 * window.devicePixelRatio;
  const translation = [
    ((currentPos[0] - lastPos[0]) / canvas.width) * -s,
    ((currentPos[1] - lastPos[1]) / canvas.height) * s,
    0.0,
  ];
  mat4.translate(
    properties.transformation,
    translation,
    properties.transformation,
  );

  lastPos = currentPos;
});

window.addEventListener('touchend', () => {
  lastPos = null;
});

// Resize observer and cleanup

const resizeObserver = new ResizeObserver(() => {
  msTexture.destroy();
  msTexture = device.createTexture({
    size: [
      canvas.clientWidth * window.devicePixelRatio,
      canvas.clientHeight * window.devicePixelRatio,
    ],
    sampleCount: 4,
    format: presentationFormat,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  msView = msTexture.createView();

  renderPassDescriptor.colorAttachments[0].view = msView;
  renderBackgroundPassDescriptor.colorAttachments[0].view = msView;
});

resizeObserver.observe(canvas);

// #region Example controls and cleanup

export const controls = {
  [initialFunctions[0].name]: {
    initial: initialFunctions[0].code,
    async onTextChange(value: string) {
      computePipelines[0] = await tryRecreateComputePipeline(value);
    },
  },
  [initialFunctions[1].name]: {
    initial: initialFunctions[1].code,
    async onTextChange(value: string) {
      computePipelines[1] = await tryRecreateComputePipeline(value);
    },
  },
  [initialFunctions[2].name]: {
    initial: initialFunctions[2].code,
    async onTextChange(value: string) {
      computePipelines[2] = await tryRecreateComputePipeline(value);
    },
  },
  'line width': {
    initial: 0.01,
    min: 0.0,
    max: 0.025,
    step: 0.001,
    onSliderChange(value: number) {
      properties.lineWidth = value;
    },
  },
  'interpolation points count': {
    initial: '256',
    options: [4, 16, 64, 256, 1024, 4096].map((x) => x.toString()),
    onSelectChange(value: string) {
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
    async onButtonClick() {
      properties.transformation = mat4.identity(d.mat4x4f());
    },
  },
};

export function onCleanup() {
  destroyed = true;
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
