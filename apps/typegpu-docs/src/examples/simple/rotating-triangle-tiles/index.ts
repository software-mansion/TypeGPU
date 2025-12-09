import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { createBezier } from './bezier';


const ease = createBezier(0.18, 0.7, 0.68, 1.03);
const green = d.vec4f(0.11764705882352941, 0.8392156862745098, 0.5137254901960784, 1);
const yellow = d.vec4f(0.8392156862745098, 0.6470588235294118, 0.11764705882352941, 1);
const indigo = d.vec4f(0.3803921568627451, 0.3333333333333333, 0.9607843137254902, 1);


const root = await tgpu.init();

const PositionArray = d.arrayOf(d.vec2f); 

const Uniforms = d.struct({
  trianglePositions: PositionArray(6),
});


const pos = PositionArray(3)([
  d.vec2f(0.0, 0.5),
  d.vec2f(-0.5, -0.5),
  d.vec2f(0.5, -0.5)
]);

const pos2 = pos.map( pos => std.mul(pos, 0.25))

const uniforms = root.createReadonly(Uniforms,{trianglePositions: PositionArray(6)([...pos, ...pos2])});

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

const wgsl2 = tgpu.resolve({ externals: { mainFragment } });
console.log(wgsl2);

// uniforms.writePartial({firstTrianglePositions: pos.map((p, i) => ({idx: i, value: p})})

const mainVertex = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex},
  out: { outPos: d.builtin.position, color: d.vec4f},
})((input) => {
  const vertexPosition = uniforms.$.trianglePositions[input.vertexIndex];
  console.log(input.vertexIndex)

  let color = yellow;
  if (input.vertexIndex > 3) {
    color = green;
  }

  return {outPos: d.vec4f(vertexPosition, 0, 1), color};
});

const wgsl = tgpu.resolve({ externals: { mainVertex } });
console.log(wgsl);

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});


const pipeline = root['~unstable']
  .withVertex(mainVertex, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

let isRunning = true;

function draw(timestamp: number) {
  if (!isRunning) return;

  time.write((timestamp * 0.0001) % 1000);

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 0],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(6);

  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);


export function onCleanup() {
  isRunning = false;
  root.destroy();
}
