import { perlin3d } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';

const Params = d.struct({
  fromColor: d.vec3f,
  toColor: d.vec3f,
  polarCoords: d.u32,
  squashed: d.u32,
  sharpness: d.f32,
  distortion: d.f32,
  time: d.f32,
  grainSeed: d.f32,
});

const root = await tgpu.init();
const paramsUniform = root.createUniform(Params);

const getGradientColor = (ratio: number) => {
  'use gpu';
  const p = paramsUniform.$;
  if (p.squashed === 1) {
    return std.mix(p.fromColor, p.toColor, std.smoothstep(0.1, 0.9, ratio));
  }
  return std.mix(p.fromColor, p.toColor, ratio);
};

const tanhVec = (v: d.v2f): d.v2f => {
  'use gpu';
  const len = std.length(v);
  const tanh = std.tanh(len);
  return v.div(len).mul(tanh);
};

const grain = (color: d.v3f, uv: d.v2f) => {
  'use gpu';
  return color.add(
    perlin3d.sample(d.vec3f(uv.mul(200), paramsUniform.$.grainSeed)) * 0.1,
  );
};

const positions = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0, 0.8),
  d.vec2f(-0.8, -0.8),
  d.vec2f(0.8, -0.8),
]);

const uvs = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0.5, 1),
  d.vec2f(0, 0),
  d.vec2f(1, 0),
]);

const perlinCache = perlin3d.staticCache({ root, size: d.vec3u(32, 32, 32) });
const pipeline = root
  .pipe(perlinCache.inject())
  .createRenderPipeline({
    vertex: ({ $vertexIndex }) => {
      'use gpu';
      return {
        $position: d.vec4f(positions.$[$vertexIndex], 0, 1),
        uv: uvs.$[$vertexIndex],
      };
    },
    fragment: ({ uv }) => {
      'use gpu';
      const params = paramsUniform.$;
      const t = params.time * 0.1;
      const ouv = uv.mul(5).add(d.vec2f(0, -t));
      let off = d
        .vec2f(
          perlin3d.sample(d.vec3f(ouv, t)),
          perlin3d.sample(d.vec3f(ouv.mul(2), t + 10)) * 0.5,
        ).add(-0.1);
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
      return std.saturate(d.vec4f(grain(getGradientColor(factor), uv), 1));
    },
  });

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

let frameId: number;
function frame(timestamp: number) {
  paramsUniform.writePartial({
    time: timestamp / 1000,
    grainSeed: Math.floor(Math.random() * 100),
  });

  pipeline
    .withColorAttachment({ view: context })
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
      paramsUniform.writePartial({ distortion: v });
    },
  },
  'Sharpness': {
    initial: 4.5,
    min: 0,
    max: 7,
    step: 0.1,
    onSliderChange(v: number) {
      paramsUniform.writePartial({ sharpness: v ** 2 });
    },
  },
  'From Color': {
    initial: [0.057, 0.2235, 0.4705],
    onColorChange(value: readonly [number, number, number]) {
      paramsUniform.writePartial({ fromColor: d.vec3f(...value) });
    },
  },
  'To Color': {
    initial: [1.538, 0.784, 2],
    onColorChange(value: readonly [number, number, number]) {
      paramsUniform.writePartial({ toColor: d.vec3f(...value) });
    },
  },
  'Polar Coordinates': {
    initial: false,
    onToggleChange(value: boolean) {
      paramsUniform.writePartial({ polarCoords: value ? 1 : 0 });
    },
  },
  'Squashed': {
    initial: true,
    onToggleChange(value: boolean) {
      paramsUniform.writePartial({ squashed: value ? 1 : 0 });
    },
  },
  'Clouds Preset': {
    onButtonClick() {
      paramsUniform.writePartial({
        distortion: 0.05,
        sharpness: 4.5 ** 2,
        fromColor: d.vec3f(0.057, 0.2235, 0.4705),
        toColor: d.vec3f(1.538, 0.784, 2),
        polarCoords: 0,
        squashed: 1,
      });
    },
  },
  'Fire Preset': {
    onButtonClick() {
      paramsUniform.writePartial({
        distortion: 0.1,
        sharpness: 7 ** 2,
        fromColor: d.vec3f(2, 0.4, 0.5),
        toColor: d.vec3f(0, 0, 0.4),
        polarCoords: 1,
        squashed: 0,
      });
    },
  },
};

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}
