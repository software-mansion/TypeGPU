import { perlin3d } from '@typegpu/noise';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();

const blue = d.vec3f(0.114, 0.447, 0.941).mul(0.5);
const purple = d.vec3f(0.769, 0.392, 1.0).mul(2);
const sharpness = 20;
const distortion = 0.05;
const timeUniform = root.createUniform(d.f32);
const grainSeed = root.createUniform(d.f32);

const getGradientColor = (ratio: number) => {
  'use gpu';
  return std.mix(blue, purple, std.smoothstep(0.2, 0.8, ratio));
};

const tanhVec = (v: d.v2f): d.v2f => {
  'use gpu';
  const len = std.length(v);
  const tanh = std.tanh(len);
  return v.div(len).mul(tanh);
};

const grain = (color: d.v3f, uv: d.v2f) => {
  'use gpu';
  return color.add(perlin3d.sample(d.vec3f(uv.mul(200), grainSeed.$)) * 0.1);
};

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const pipeline = root['~unstable'].createRenderPipeline({
  vertex: ({ $vertexIndex }) => {
    'use gpu';
    const pos = [d.vec2f(0, 0.8), d.vec2f(-0.8, -0.8), d.vec2f(0.8, -0.8)];
    const uv = [d.vec2f(0.5, 1), d.vec2f(0, 0), d.vec2f(1, 0)];

    return {
      $position: d.vec4f(pos[$vertexIndex], 0, 1),
      uv: uv[$vertexIndex],
    };
  },
  fragment: ({ uv }) => {
    'use gpu';
    const t = timeUniform.$ * 0.1;
    const ouv = uv.mul(5).add(d.vec2f(0, t));
    let off = d
      .vec2f(
        perlin3d.sample(d.vec3f(ouv, t)),
        perlin3d.sample(d.vec3f(ouv.mul(2), t + 10)) * 0.5,
      ).add(-0.1);
    // Sharpening the offset
    off = tanhVec(off.mul(sharpness));
    // Offsetting the sample point by the distortion
    const p = uv.add(off.mul(distortion));

    const factor = (p.x + p.y) * 0.7; // How far along the diagonal we are
    return std.saturate(d.vec4f(grain(getGradientColor(factor), uv), 1));
  },
  targets: { format: presentationFormat },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

let frameId: number;
function frame(timestamp: number) {
  timeUniform.write(timestamp / 1000);
  grainSeed.write(Math.floor(Math.random() * 100));
  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}
