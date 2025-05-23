import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { randf } from '@typegpu/noise';
import { add, cos, dot, floor, mix, mul, pow, sin, sub } from 'typegpu/std';

const PI = Math.PI;

const computeJunctionGradient = tgpu['~unstable'].fn([d.vec2i], d.vec2f)(
  (pos) => {
    randf.seed2(d.vec2f(pos));
    const theta = randf.sample() * 2 * PI;
    return d.vec2f(cos(theta), sin(theta));
  },
);

const getJunctionGradientSlot = tgpu['~unstable'].slot(computeJunctionGradient);

const smootherStep = tgpu['~unstable'].fn([d.f32], d.f32)((x) => {
  return 6 * pow(x, 5) - 15 * pow(x, 4) + 10 * pow(x, 3);
});

const smootherMix = tgpu['~unstable'].fn([d.f32, d.f32, d.f32], d.f32)(
  (a, b, t) => {
    return mix(a, b, smootherStep(t));
  },
);

const dotProdGrid = tgpu['~unstable'].fn([d.vec2f, d.vec2i], d.f32)(
  (samplePos, junctionPos) => {
    const relative = sub(samplePos, d.vec2f(junctionPos));
    const gridVector = getJunctionGradientSlot.value(junctionPos);
    return dot(relative, gridVector);
  },
);

const samplePerlin = tgpu['~unstable'].fn([d.vec2f], d.f32)((pos) => {
  const topLeftJunction = d.vec2i(floor(pos));

  const topLeft = dotProdGrid(pos, topLeftJunction);
  const topRight = dotProdGrid(pos, add(topLeftJunction, d.vec2i(1, 0)));
  const bottomLeft = dotProdGrid(pos, add(topLeftJunction, d.vec2i(0, 1)));
  const bottomRight = dotProdGrid(pos, add(topLeftJunction, d.vec2i(1, 1)));

  const partial = sub(pos, floor(pos));
  const top = smootherMix(topLeft, topRight, partial.x);
  const bottom = smootherMix(bottomLeft, bottomRight, partial.x);
  return smootherMix(top, bottom, partial.y);
});

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0.0, 1.0),
    uv: pos[input.vertexIndex],
  };
});

const gridSizeAccess = tgpu['~unstable'].accessor(d.f32);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  // TODO: Use the value of gridSizeAccess directly after
  // we fix type inference of accessors.
  const gridSize = d.f32(gridSizeAccess.value);
  const n = samplePerlin(mul(gridSize, input.uv));
  return d.vec4f(d.vec3f(n * 0.5 + 0.5), 1);
});

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const gridSizeUniform = root['~unstable'].createUniform(d.f32, 32);

const renderPipeline = root['~unstable']
  .with(gridSizeAccess, gridSizeUniform)
  .withVertex(fullScreenTriangle, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

const draw = async () => {
  const view = context.getCurrentTexture().createView();

  renderPipeline.withColorAttachment({
    view,
    loadOp: 'clear',
    storeOp: 'store',
  }).draw(3);
};

draw();

export const controls = {
  'grid size': {
    initial: '16',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      gridSizeUniform.write(Number.parseInt(value));
      draw();
    },
  },
};

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}
