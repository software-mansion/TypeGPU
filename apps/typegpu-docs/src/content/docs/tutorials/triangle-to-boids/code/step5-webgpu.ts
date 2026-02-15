// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN
import {
  addButtonParameter,
  addElement,
  onFrame,
} from '@typegpu/example-toolkit';

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();

if (!device) {
  throw new Error('Failed to acquire a device');
}

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

addButtonParameter('Randomize', randomizeTriangles);

const triangleSize = 0.2;
const triangleVertexData = new Float32Array([
  0.0,
  triangleSize,
  -triangleSize,
  -triangleSize,
  triangleSize,
  -triangleSize,
]);

const triangleAmount = 10;
const trianglePos = device.createBuffer({
  size: triangleAmount * 3 * 4,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
});

const triangleVertexBuffer = device.createBuffer({
  size: triangleVertexData.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
new Float32Array(triangleVertexBuffer.getMappedRange()).set(triangleVertexData);
triangleVertexBuffer.unmap();

function randomizeTriangles() {
  if (!device) {
    return;
  }
  const data = new Float32Array(triangleAmount * 3);
  for (let i = 0; i < triangleAmount; i++) {
    data[i * 3] = Math.random() * 2 - 1;
    data[i * 3 + 1] = Math.random() * 2 - 1;
    data[i * 3 + 2] = Math.random() * Math.PI * 2;
  }
  device.queue.writeBuffer(trianglePos, 0, data);
}

const wgslCode = `
  fn rotate(v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
      (v.x * cos(angle)) - (v.y * sin(angle)),
      (v.x * sin(angle)) + (v.y * cos(angle))
    );
    return pos;
  };

  struct TriangleData {
    x : f32,
    y : f32,
    rotation : f32,
  };

  struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(1) fragUV : vec2f,
  };

  @binding(0) @group(0) var<storage, read> trianglePos : array<TriangleData>;

  @vertex
  fn mainVert(@builtin(instance_index) ii: u32 ,@location(0) v: vec2f) -> VertexOutput {
    let instanceInfo = trianglePos[ii];

    let rotated = rotate(v, instanceInfo.rotation);
    let offset = vec2(instanceInfo.x, instanceInfo.y);

    let pos = vec4(rotated + offset, 0.0, 1.0);
    let fragUV = (rotated + vec2f(${triangleSize}, ${triangleSize})) / vec2f(${triangleSize} * 2.0);
    return VertexOutput(pos, fragUV);
  }

  @fragment
  fn mainFrag(@location(1) fragUV : vec2f) -> @location(0) vec4f {
    let color1 = vec3(196.0 / 255.0, 100.0 / 255.0, 255.0 / 255.0);
    let color2 = vec3(29.0 / 255.0, 114.0 / 255.0, 240.0 / 255.0);

    let dist = length(fragUV - vec2(0.5, 0.5));

    let color = mix(color1, color2, dist);

    return vec4(color, 1.0);
  }
`;

const wgslCodeCompute = `
  struct TriangleData {
    x : f32,
    y : f32,
    rotation : f32,
  };

  @binding(0) @group(0) var<storage, read_write> trianglePos : array<TriangleData>;

  @compute @workgroup_size(1)
  fn mainCompute(@builtin(global_invocation_id) gid: vec3u) {
    let index = gid.x;
    var instanceInfo = trianglePos[index];
    let triangleSize = ${triangleSize};

    if (instanceInfo.x > 1.0 + triangleSize) {
      instanceInfo.x = -1.0 - triangleSize;
    }
    if (instanceInfo.y > 1.0 + triangleSize) {
      instanceInfo.y = -1.0 - triangleSize;
    }

    instanceInfo.rotation += 0.01;
    instanceInfo.x += 0.01;
    instanceInfo.y += 0.01;

    trianglePos[index] = instanceInfo;
  }
`;

const module = device.createShaderModule({
  code: wgslCode,
});
const moduleCompute = device.createShaderModule({
  code: wgslCodeCompute,
});

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: module,
    buffers: [
      {
        arrayStride: 2 * 4,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2',
          },
        ],
      },
    ],
  },
  fragment: {
    module: module,
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

const computePipeline = device.createComputePipeline({
  layout: 'auto',
  compute: {
    module: moduleCompute,
  },
});

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: trianglePos,
      },
    },
  ],
});

const bindGroupCompute = device.createBindGroup({
  layout: computePipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: trianglePos,
      },
    },
  ],
});

randomizeTriangles();
onFrame(() => {
  const commandEncoder = device.createCommandEncoder();
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

  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, bindGroupCompute);
  computePass.dispatchWorkgroups(triangleAmount);
  computePass.end();

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.setVertexBuffer(0, triangleVertexBuffer);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.draw(3, triangleAmount);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
});
