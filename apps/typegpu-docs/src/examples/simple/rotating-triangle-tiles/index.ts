import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { createBezier } from './bezier';


const ease = createBezier(0.18, 0.7, 0.68, 1.03);
const green = d.vec4f(0.11764705882352941, 0.8392156862745098, 0.5137254901960784, 1);
const yellow = d.vec4f(0.8392156862745098, 0.6470588235294118, 0.11764705882352941, 1);
const indigo = d.vec4f(0.3803921568627451, 0.3333333333333333, 0.9607843137254902, 1);

const colors = [green, yellow, indigo];

const root = await tgpu.init();

function rotate(coordinate: d.v2f, angleInDegrees: number) {
  'use gpu';
  const angle = angleInDegrees * Math.PI / 180;
  const x = coordinate.x;
  const y = coordinate.y;
  return d.vec2f(x*std.cos(angle) - y*std.sin(angle), x*std.sin(angle) + y*std.cos(angle))
}

const PositionArray = d.arrayOf(d.vec2f); 

const TrianglePositions = d.struct({
  positions: PositionArray(6),
});


const originalPositions = PositionArray(3)([
  d.vec2f(-std.sqrt(3), -1),
  d.vec2f(0, 2),
  d.vec2f(std.sqrt(3), -1)
]);

const pos = originalPositions.map( pos => std.mul(pos, 0.5))

const pos2 = pos.map(pos => rotate(std.mul(pos, 0.5), 180));

const trianglePositionBuffer = root.createReadonly(TrianglePositions,
  { positions: PositionArray(6)([...pos, ...pos2]) });

const time = root.createUniform(d.f32);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: {color: d.vec4f},
  out: d.vec4f,
})((input) => {
  // randf.seed(time.$);
  // const random = randf.sample();
  // console.log(random);
  // if (random < 0.5) {
  //   return green;
  // }
  // return yellow;
  return input.color;
}) 

const wgsl2 = tgpu.resolve([mainFragment]);
console.log(wgsl2);

const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex},
  out: { outPos: d.builtin.position, color: d.vec4f},
})((input) => {
  const vertexPosition = trianglePositionBuffer.$.positions[input.vertexIndex];
  let calculatedPosition = d.vec2f(vertexPosition);
  const k = input.vertexIndex

  let color = yellow;
  if (input.vertexIndex > 2) {
    color = green;
    calculatedPosition = rotate(vertexPosition, time.$ )
  }

  return {outPos: d.vec4f(calculatedPosition, 0, 1), color};
});

const maskVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex},
  out: { outPos: d.builtin.position},
})((input) => {
  const vertexPosition = trianglePositionBuffer.$.positions[input.vertexIndex + 3];

  return {outPos: d.vec4f(vertexPosition, 0, 1)};
});

const wgsl = tgpu.resolve([mainVertex]);
console.log(wgsl);

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let depthTexture = root.device.createTexture({
  size: [canvas.width, canvas.height, 1],
  format: 'depth24plus',
  usage: GPUTextureUsage.RENDER_ATTACHMENT,
});

const maskFragment = tgpu['~unstable'].fragmentFn({
  out: d.builtin.fragDepth,
})(() => {
  return 1.0;
});


const maskPipeline = root['~unstable']
  .withVertex(maskVertex, {})
  .withFragment(maskFragment)
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: true,
    depthCompare: 'always',
  })
  .createPipeline();

const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .withDepthStencil({
    format: 'depth24plus',
    depthWriteEnabled: false,
    depthCompare: 'less',
  })
  .createPipeline();

let isRunning = true;

console.log(tgpu.resolve([maskPipeline]));


function draw(timestamp: number) {
  if (!isRunning) return;

  time.write((timestamp * 0.01) % 1000);

  maskPipeline
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthClearValue: 0,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
    })
    .draw(3);  
  
  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .withDepthStencilAttachment({
      view: depthTexture.createView(),
      depthLoadOp: 'load',
      depthStoreOp: 'store',
    })
    .draw(6);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

const resizeObserver = new ResizeObserver(() => {

  depthTexture.destroy();
  depthTexture = root.device.createTexture({
    size: [canvas.width, canvas.height, 1],
    format: 'depth24plus',
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });
});
resizeObserver.observe(canvas);

export function onCleanup() {
  isRunning = false;

  resizeObserver.disconnect();
  root.destroy();
}