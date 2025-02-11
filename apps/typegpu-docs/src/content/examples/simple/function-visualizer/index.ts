import tgpu from 'typegpu';

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
      code: 'x * x - 0.5',
      color: '0.0, 1.0, 0.0',
    },
    h: {
      code: '(x+0.1) * x * (x-0.1)',
      color: '0.0, 0.0, 1.0',
    },
  },
  interpolationPoints: 256,
  lineWidth: 0.1,
};

// deferring to wait for canvas to init
setTimeout(() => {
  draw(input);
}, 100);

async function draw(input: Input) {
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

  for (const fn in input.functions) {
    const { code: fnString, color } = input.functions[fn];

    const buffer = runComputePass(device, fnString, input.interpolationPoints);

    runRenderPass(device, context, presentationFormat, buffer, input, color);
  }
}

// #region function definitions

function runComputePass(
  device: GPUDevice,
  functionString: string,
  interpolationPoints: number,
) {
  const computeShaderCode = /* wgsl */ `
fn interpolatedFunction(x: f32) -> f32 {
return ${functionString};
}

@group(0) @binding(0) var<storage, read_write> lineVertices: array<vec2f>;

@compute @workgroup_size(1) fn computePoints(
@builtin(global_invocation_id) id: vec3u
) {
let point = (-1.0 + 2.0/(${interpolationPoints} - 1) * f32(id.x));
let value = interpolatedFunction(point);
lineVertices[id.x] = vec2f(point, value);
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
    entries: [{ binding: 0, resource: { buffer: lineVerticesBuffer } }],
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

function runRenderPass(
  device: GPUDevice,
  context: GPUCanvasContext,
  presentationFormat: GPUTextureFormat,
  lineVerticesBuffer: GPUBuffer,
  input: Input,
  color: string,
) {
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

// #endregion
