import { perlin3d } from '@typegpu/noise';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();

const fromColor = root.createUniform(d.vec3f);
const polarCoords = root.createUniform(d.u32);
const squashed = root.createUniform(d.u32);
const toColor = root.createUniform(d.vec3f);
const sharpness = root.createUniform(d.f32);
const distortion = root.createUniform(d.f32);
const time = root.createUniform(d.f32);
const grainSeed = root.createUniform(d.f32);

const getGradientColor = (ratio: number) => {
  'use gpu';
  if (squashed.$ === 1) {
    return std.mix(fromColor.$, toColor.$, std.smoothstep(0.1, 0.9, ratio));
  }
  return std.mix(fromColor.$, toColor.$, ratio);
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
    const t = time.$ * 0.1;
    const ouv = uv.mul(5).add(d.vec2f(0, -t));
    let off = d
      .vec2f(
        perlin3d.sample(d.vec3f(ouv, t)),
        perlin3d.sample(d.vec3f(ouv.mul(2), t + 10)) * 0.5,
      ).add(-0.1);
    // Sharpening the offset
    off = tanhVec(off.mul(sharpness.$));
    // Offsetting the sample point by the distortion
    const p = uv.add(off.mul(distortion.$));

    // const factor = (p.x - p.y + 0.7) * 0.7; // How far along the diagonal we are
    let factor = d.f32(0);
    if (polarCoords.$ === 1) {
      factor = std.length(p.sub(d.vec2f(0.5, 0.3)).mul(2));
    } else {
      factor = (p.x + p.y) * 0.7; // How far along the diagonal we are
    }
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
  time.write(timestamp / 1000);
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

export const controls = {
  'Distortion': {
    initial: 0.05,
    min: 0,
    max: 0.2,
    step: 0.001,
    onSliderChange(v: number) {
      distortion.write(v);
    },
  },
  'Sharpness': {
    initial: 4.5,
    min: 0,
    max: 7,
    step: 0.1,
    onSliderChange(v: number) {
      sharpness.write(v ** 2);
    },
  },
  'From Color': {
    initial: [0.057, 0.2235, 0.4705],
    onColorChange(value: readonly [number, number, number]) {
      fromColor.write(d.vec3f(...value));
    },
  },
  'To Color': {
    initial: [1.538, 0.784, 2],
    onColorChange(value: readonly [number, number, number]) {
      toColor.write(d.vec3f(...value));
    },
  },
  'Polar Coordinates': {
    initial: false,
    onToggleChange(value: boolean) {
      polarCoords.write(value ? 1 : 0);
    },
  },
  'Squashed': {
    initial: true,
    onToggleChange(value: boolean) {
      squashed.write(value ? 1 : 0);
    },
  },
  'Clouds Preset': {
    onButtonClick() {
      distortion.write(0.05);
      sharpness.write(4.5 ** 2);
      fromColor.write(d.vec3f(0.057, 0.2235, 0.4705));
      toColor.write(d.vec3f(1.538, 0.784, 2));
      polarCoords.write(0);
      squashed.write(1);
    },
  },
  'Fire Preset': {
    onButtonClick() {
      distortion.write(0.1);
      sharpness.write(7 ** 2);
      fromColor.write(d.vec3f(2, 0.4, 0.5));
      toColor.write(d.vec3f(0, 0, 0.4));
      polarCoords.write(1);
      squashed.write(0);
    },
  },
};

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}
