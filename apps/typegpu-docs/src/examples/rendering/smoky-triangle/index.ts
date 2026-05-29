import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std, type TgpuFragmentFn, type TgpuVertexFn } from 'typegpu';

import { defineControls } from '../../common/defineControls.ts';

const Params = d.struct({
  fromColor: d.vec3f,
  toColor: d.vec3f,
  intensity: d.f32,
  polarCoords: d.u32,
  squashed: d.u32,
  sharpness: d.f32,
  distortion: d.f32,
  time: d.f32,
  grainSeed: d.f32,
});

const root = await tgpu.init();
const paramsUniform = root.createUniform(Params);

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

let rgba16floatAvailable = true;
try {
  root.configureContext({
    canvas,
    format: 'rgba16float',
  });
} catch {
  rgba16floatAvailable = false;
}

const hdr = rgba16floatAvailable && window.matchMedia('(dynamic-range: high)').matches;
const preferredFormat = navigator.gpu.getPreferredCanvasFormat();

let context = root.configureContext({
  canvas,
  alphaMode: 'premultiplied',
  format: preferredFormat,
});

const getGradientColor = (ratio: number) => {
  'use gpu';
  const p = paramsUniform.$;
  const fromColor = p.fromColor * p.intensity;
  const toColor = p.toColor * p.intensity;

  if (p.squashed === 1) {
    return std.mix(fromColor, toColor, std.smoothstep(0.1, 0.9, ratio));
  }
  return std.mix(fromColor, toColor, ratio);
};

const tanhVec = (v: d.v2f): d.v2f => {
  'use gpu';
  const len = std.length(v);
  const tanh = std.tanh(len);
  return v.div(len).mul(tanh);
};

const grain = (color: d.v3f, uv: d.v2f) => {
  'use gpu';
  return color.add(perlin3d.sample(d.vec3f(uv.mul(200), paramsUniform.$.grainSeed)) * 0.1);
};

const positions = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0, 0.8),
  d.vec2f(-0.8, -0.8),
  d.vec2f(0.8, -0.8),
]);

const uvs = tgpu.const(d.arrayOf(d.vec2f, 3), [d.vec2f(0.5, 1), d.vec2f(0, 0), d.vec2f(1, 0)]);

const vertex = ({ $vertexIndex }: TgpuVertexFn.AutoInEmpty) => {
  'use gpu';
  return {
    $position: d.vec4f(positions.$[$vertexIndex], 0, 1),
    uv: uvs.$[$vertexIndex],
  } satisfies TgpuVertexFn.AutoOut;
};

const fragment = ({ uv }: TgpuFragmentFn.AutoIn<{ uv: d.v2f }>) => {
  'use gpu';
  const params = paramsUniform.$;
  const t = params.time * 0.1;
  const ouv = uv.mul(5).add(d.vec2f(0, -t));
  let off = d
    .vec2f(perlin3d.sample(d.vec3f(ouv, t)), perlin3d.sample(d.vec3f(ouv.mul(2), t + 10)) * 0.5)
    .add(-0.1);
  // Sharpening the offset
  off = tanhVec(off.mul(params.sharpness));
  // Offsetting the sample point by the distortion
  const p = uv.add(off.mul(params.distortion));

  // const factor = (p.x - p.y + 0.7) * 0.7; // How far along the diagonal we are
  let factor = d.f32(0);
  if (params.polarCoords === 1) {
    factor = std.length(p.sub(d.vec2f(0.5, 0.3)).mul(2));
  } else {
    factor = (p.x + p.y) * 0.7; // How far along the diagonal we are
  }
  return d.vec4f(grain(getGradientColor(factor), uv), 1);
};

const perlinCache = perlin3d.staticCache({ root, size: d.vec3u(32, 32, 32) });

const hdrPipeline = root.pipe(perlinCache.inject()).createRenderPipeline({
  vertex,
  fragment,
  targets: { format: 'rgba16float' },
});

const basePipeline = root.pipe(perlinCache.inject()).createRenderPipeline({
  vertex,
  fragment,
  targets: { format: preferredFormat },
});

let pipeline = basePipeline;

let frameId: number;
function frame(timestamp: number) {
  paramsUniform.patch({
    time: timestamp / 1000,
    grainSeed: Math.floor(Math.random() * 100),
  });

  pipeline.withColorAttachment({ view: context }).draw(3);

  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

const controls = hdr
  ? defineControls({
      HDR: {
        initial: false,
        onToggleChange(value: boolean) {
          context = root.configureContext({
            canvas,
            alphaMode: 'premultiplied',
            format: value ? 'rgba16float' : preferredFormat,
            toneMapping: { mode: value ? 'extended' : 'standard' },
          });

          pipeline = value ? hdrPipeline : basePipeline;
        },
      },
    })
  : {};

const baseControls = defineControls({
  Distortion: {
    initial: 0.05,
    min: 0,
    max: 0.2,
    step: 0.001,
    onSliderChange(v: number) {
      paramsUniform.patch({ distortion: v });
    },
  },
  Sharpness: {
    initial: 4.5,
    min: 0,
    max: 7,
    step: 0.1,
    onSliderChange(v: number) {
      paramsUniform.patch({ sharpness: v ** 2 });
    },
  },
  'From Color': {
    initial: d.vec3f(0.0285, 0.11175, 0.23525),
    onColorChange(value: d.v3f) {
      paramsUniform.patch({ fromColor: value });
    },
  },
  'To Color': {
    initial: d.vec3f(0.769, 0.392, 1.0),
    onColorChange(value: d.v3f) {
      paramsUniform.patch({ toColor: value });
    },
  },
  'Color Intensity': {
    initial: 2,
    min: 0,
    max: 4,
    step: 0.1,
    onSliderChange(v: number) {
      paramsUniform.patch({ intensity: v });
    },
  },
  'Polar Coordinates': {
    initial: false,
    onToggleChange(value: boolean) {
      paramsUniform.patch({ polarCoords: value ? 1 : 0 });
    },
  },
  Squashed: {
    initial: true,
    onToggleChange(value: boolean) {
      paramsUniform.patch({ squashed: value ? 1 : 0 });
    },
  },
  'Clouds Preset': {
    onButtonClick() {
      paramsUniform.patch({
        distortion: 0.05,
        sharpness: 4.5 ** 2,
        fromColor: d.vec3f(0.0285, 0.11175, 0.23525),
        toColor: d.vec3f(0.769, 0.392, 1.0),
        intensity: 2,
        polarCoords: 0,
        squashed: 1,
      });
    },
  },
  'Fire Preset': {
    onButtonClick() {
      paramsUniform.patch({
        distortion: 0.1,
        sharpness: 7 ** 2,
        fromColor: d.vec3f(1, 0.2, 0.25),
        toColor: d.vec3f(0, 0, 0.2),
        intensity: 2,
        polarCoords: 1,
        squashed: 0,
      });
    },
  },
});

Object.assign(controls, baseControls);

export { controls };

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}
