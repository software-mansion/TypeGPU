import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as s from 'typegpu/std';

import {
  circleFan,
  circleMaxArea,
  circleMaxAreaVertexCount,
} from '@typegpu/geometry';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas');
const context = canvas?.getContext('webgpu');
const multisample = true;

if (!canvas) {
  throw new Error('Could not find canvas');
}
if (!context) {
  throw new Error('Could not create WebGPU context');
}

const adapter = await navigator.gpu.requestAdapter();
console.log(`Using ${adapter?.info.vendor} adapter`);
const device = await adapter?.requestDevice({
  requiredFeatures: ['timestamp-query'],
});
if (!device) {
  throw new Error('Could not get WebGPU device');
}
const root = tgpu.initFromDevice({ device });

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// Textures
let msaaTexture: GPUTexture;
let msaaTextureView: GPUTextureView;

const createDepthAndMsaaTextures = () => {
  if (msaaTexture) {
    msaaTexture.destroy();
  }
  msaaTexture = device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: presentationFormat,
    sampleCount: 4,
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
  msaaTextureView = msaaTexture.createView();
};

createDepthAndMsaaTextures();
const resizeObserver = new ResizeObserver(createDepthAndMsaaTextures);
resizeObserver.observe(canvas);

// const Uniforms = d.struct({});

const Circle = d.struct({
  position: d.vec2f,
  radius: d.f32,
});

const bindGroupLayout = tgpu.bindGroupLayout({
  // uniforms: {
  //   uniform: Uniforms,
  // },
  circles: {
    storage: (n: number) => d.arrayOf(Circle, n),
  },
});

// const uniforms = root.createBuffer(Uniforms, {}).$usage(
//   'uniform',
// );

const circleCount = 1000;
const circles = root.createBuffer(
  d.arrayOf(Circle, circleCount),
  Array.from({ length: circleCount }).map(() =>
    Circle({
      position: d.vec2f(Math.random() * 2 - 1, Math.random() * 2 - 1),
      radius: 0.05 * Math.random() + 0.01,
    })
  ),
).$usage('storage');

const uniformsBindGroup = root.createBindGroup(bindGroupLayout, {
  // uniforms,
  circles,
});

const mainVertexMaxArea = tgpu['~unstable'].vertexFn({
  in: {
    instanceIndex: d.builtin.instanceIndex,
    vertexIndex: d.builtin.vertexIndex,
  },
  out: {
    outPos: d.builtin.position,
    uv: d.vec2f,
    instanceIndex: d.interpolate('flat', d.u32),
  },
})(({ vertexIndex, instanceIndex }) => {
  const circle = bindGroupLayout.$.circles[instanceIndex];
  const unit = circleMaxArea(vertexIndex);
  const pos = s.add(circle.position, s.mul(unit, circle.radius));
  return {
    outPos: d.vec4f(pos, 0.0, 1.0),
    uv: unit,
    instanceIndex,
  };
});

const mainVertexFan = tgpu['~unstable'].vertexFn({
  in: {
    instanceIndex: d.builtin.instanceIndex,
    vertexIndex: d.builtin.vertexIndex,
  },
  out: {
    outPos: d.builtin.position,
    uv: d.vec2f,
    instanceIndex: d.interpolate('flat', d.u32),
  },
})(({ vertexIndex, instanceIndex }) => {
  const circle = bindGroupLayout.$.circles[instanceIndex];
  const unit = circleFan(vertexIndex, 10);
  const pos = s.add(circle.position, s.mul(unit, circle.radius));
  return {
    outPos: d.vec4f(pos, 0.0, 1.0),
    uv: unit,
    instanceIndex,
  };
});

console.log(tgpu.resolve({ externals: { mainVertexFan } }));

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: {
    uv: d.vec2f,
    instanceIndex: d.interpolate('flat', d.u32),
  },
  out: d.vec4f,
})(({ uv, instanceIndex }) => {
  const color = d.vec3f(
    1,
    s.cos(d.f32(instanceIndex)),
    s.sin(5 * d.f32(instanceIndex)),
  );
  const r = s.length(uv);
  return d.vec4f(
    s.mix(color, d.vec3f(), s.clamp((r - 0.9) * 20, 0, 0.5)),
    1,
  );
});

const pipeline = root['~unstable']
  .withVertex(mainVertexMaxArea, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .withMultisample({ count: multisample ? 4 : 1 })
  .createPipeline();

setTimeout(() => {
  pipeline
    .with(bindGroupLayout, uniformsBindGroup)
    .withColorAttachment({
      ...(multisample
        ? {
          view: msaaTextureView,
          resolveTarget: context.getCurrentTexture().createView(),
        }
        : {
          view: context.getCurrentTexture().createView(),
        }),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withPerformanceCallback((a, b) => {
      console.log((Number(b - a) * 1e-6).toFixed(3), 'ms');
    })
    .draw(circleMaxAreaVertexCount(4), circleCount);
}, 100);

export function onCleanup() {
  root.destroy();
}
