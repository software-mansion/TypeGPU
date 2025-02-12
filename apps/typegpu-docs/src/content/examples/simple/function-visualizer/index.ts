import tgpu from 'typegpu';
import { mat4, vec4 } from 'wgpu-matrix';

type FunctionDef = {
  code: string;
  color: `${number}, ${number}, ${number}`;
};

type Input = {
  functions: Record<string, FunctionDef>;
  interpolationPoints: number;
  lineWidth: number;
};

const input: Input = {
  functions: {
    f: {
      code: 'sin(x*10)/2',
      color: '1.0, 0.0, 0.0',
    },
    g: {
      code: '0.1 * x * x - 0.5',
      color: '0.0, 1.0, 0.0',
    },
    h: {
      code: '(x+0.1) * x * (x-0.1) * 0.01',
      color: '0.0, 0.0, 1.0',
    },
  },
  interpolationPoints: 256,
  lineWidth: 0.1,
};

// let lastPos: number[] | null = null;
const transformation = mat4.identity();

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

// deferring to wait for canvas to init
setTimeout(() => {
  draw();
}, 100);

async function draw() {
  context.configure({
    device: device,
    format: presentationFormat,
    alphaMode: 'premultiplied',
  });

  const transformationMatrixBuffer = device.createBuffer({
    label: 'transformation matrix buffer',
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(
    transformationMatrixBuffer,
    0,
    transformation.buffer,
  );

  const invertedTransformationMatrixBuffer = device.createBuffer({
    label: 'transformation matrix buffer',
    size: 4 * 4 * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const inverted = mat4.inverse(transformation);
  device.queue.writeBuffer(
    invertedTransformationMatrixBuffer,
    0,
    inverted.buffer,
  );

  for (const fn in input.functions) {
    const { code: fnString, color } = input.functions[fn];

    const lineVerticesBuffer = runComputePass(
      fnString,
      input.interpolationPoints,
      transformationMatrixBuffer,
      invertedTransformationMatrixBuffer,
    );

    runRenderPass(lineVerticesBuffer, color);
  }
}

// #region function definitions

function runComputePass(
  functionString: string,
  interpolationPoints: number,
  transformationMatrixBuffer: GPUBuffer,
  invertedTransformationMatrixBuffer: GPUBuffer,
) {
  const computeShaderCode = /* wgsl */ `
fn interpolatedFunction(x: f32) -> f32 {
return ${functionString};
}

@group(0) @binding(0) var<storage, read_write> lineVertices: array<vec2f>;
@group(0) @binding(1) var<uniform> transformation: mat4x4f;
@group(0) @binding(2) var<uniform> invertedTransformation: mat4x4f;

@compute @workgroup_size(1) fn computePoints(@builtin(global_invocation_id) id: vec3u) {
  let start = (transformation * vec4f(-1, 0, 0, 0)).x;
  let end = (transformation * vec4f(1, 0, 0, 0)).x;

  let pointX = (start + (end-start)/(${interpolationPoints} - 1) * f32(id.x));
  let pointY = interpolatedFunction(pointX);
  let result = invertedTransformation * vec4f(pointX, pointY, 0, 0);
  lineVertices[id.x] = result.xy;
}
`;

  const computeShaderModule = device.createShaderModule({
    label: 'Compute function points shader module',
    code: computeShaderCode,
  });

  const computePipeline = device.createComputePipeline({
    label: 'Compute function points pipeline',
    layout: 'auto',
    compute: {
      module: computeShaderModule,
    },
  });

  const lineVerticesBuffer = device.createBuffer({
    label: 'Function points buffer',
    size: interpolationPoints * 4 * 2,
    usage: GPUBufferUsage.STORAGE,
  });

  const bindGroup = device.createBindGroup({
    label: 'Compute function points bind group',
    layout: computePipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: lineVerticesBuffer } },
      { binding: 1, resource: { buffer: transformationMatrixBuffer } },
      { binding: 2, resource: { buffer: invertedTransformationMatrixBuffer } },
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
  pass.dispatchWorkgroups(interpolationPoints);
  pass.end();

  const commandBuffer = encoder.finish();
  device.queue.submit([commandBuffer]);

  return lineVerticesBuffer;
}

function runRenderPass(lineVerticesBuffer: GPUBuffer, color: string) {
  const vertexFragmentShaderCode = /* wgsl */ `
@group(0) @binding(0) var<storage, read> lineVertices: array<vec2f>;

fn normalVector(v: vec2f) -> vec2f {
  let length = sqrt(v.x * v.x + v.y * v.y);
  return v / length;
}

fn othronormalForLine(p1: vec2f, p2: vec2f) -> vec2f {
  let line = p2 - p1;
  let ortho = vec2f(-line.y, line.x);
  return normalVector(ortho);
}

fn orthonormalForVertex(index: u32) -> vec2f {
  if (index == 0 || index == ${input.interpolationPoints}-1) {
    return vec2f(0.0, 1.0);
  }
  let previous = lineVertices[index-1];
  let current = lineVertices[index];
  let next = lineVertices[index+1];

  let n1 = othronormalForLine(previous, current);
  let n2 = othronormalForLine(current, next);

  let avg = (n1+n2)/2.0;

  return normalVector(avg);
}

@vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
  let currentVertex = vertexIndex/2;
  let orthonormal = orthonormalForVertex(currentVertex);
  let offset = orthonormal * ${input.lineWidth} * select(-1.0, 1.0, vertexIndex%2==0);
  return vec4f(lineVertices[currentVertex] + offset, 0.0, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  return vec4f(${color}, 1);
}
  `;

  const vertexFragmentShaderModule = device.createShaderModule({
    label: 'Render module',
    code: vertexFragmentShaderCode,
  });

  const renderPipeline = device.createRenderPipeline({
    label: 'Render pipeline',
    layout: 'auto',
    vertex: {
      module: vertexFragmentShaderModule,
    },
    fragment: {
      module: vertexFragmentShaderModule,
      targets: [{ format: presentationFormat }],
    },
    primitive: {
      topology: 'triangle-strip',
    },
  });

  const renderBindGroup = device.createBindGroup({
    label: 'Render bindGroup',
    layout: renderPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: lineVerticesBuffer } }],
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

  function render() {
    renderPassDescriptor.colorAttachments[0].view = context
      .getCurrentTexture()
      .createView();

    const encoder = device.createCommandEncoder({ label: 'Render encoder' });

    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(renderPipeline);
    pass.setBindGroup(0, renderBindGroup);
    pass.draw(input.interpolationPoints * 2); // call our vertex shader 2 times per point drawn
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);
  }

  render();
}

// #region Example controls

export const controls = {
  'line width': {
    initial: 0.01,
    min: 0.0,
    max: 0.025,
    step: 0.001,
    onSliderChange: (value: number) => {
      input.lineWidth = value;
      draw(input);
    },
  },
  'interpolation points count': {
    initial: '256',
    options: [16, 64, 256, 1024, 4096].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      const num = Number.parseInt(value);
      input.interpolationPoints = num;
      draw(input);
    },
  },
  'red function': {
    initial: 'sin(x*10)/2',
    onTextChange: (value: string) => {
      input.functions.f.code = value;
      draw(input);
    },
  },
};

// #region canvas controls

// canvas.onmousedown = (event) => {
//   lastPos = [event.offsetX, event.offsetY];
// };

// canvas.onmouseup = (_) => {
//   lastPos = null;
// };

// canvas.onmousemove = (event) => {
//   if (lastPos == null) {
//     return;
//   }
//   const currentPos = [event.offsetX, event.offsetY];

//   mat4.translate(
//     transformation,
//     [currentPos[0] - lastPos[0], currentPos[1] - lastPos[1], 0],
//     transformation,
//   );

//   lastPos = currentPos;
//   console.log(getCorners());
// };

canvas.onwheel = (event) => {
  event.preventDefault();

  const delta = Math.abs(event.deltaY) / 1000.0 + 1;
  const scale = event.deltaY > 0 ? delta : 1 / delta;

  mat4.scale(transformation, [scale, scale, 1], transformation);
  console.log(getCorners());
  draw();
};

function getCorners() {
  const c1 = vec4.create(1, 1, 0, 0);
  const c2 = vec4.create(-1, -1, 0, 0);
  mat4.mul(transformation, c1, c1);
  mat4.mul(transformation, c2, c2);
  return [c1[0], c1[1], c2[0], c2[1]];
}

// #endregion
