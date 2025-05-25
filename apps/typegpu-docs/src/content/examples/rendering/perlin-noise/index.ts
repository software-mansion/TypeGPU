import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { perlin3d } from '@typegpu/noise';
import { abs, mix, mul, pow, sign } from 'typegpu/std';

// Used for clean-up of this example
const abortController = new AbortController();

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
const timeAccess = tgpu['~unstable'].accessor(d.f32);
const sharpnessAccess = tgpu['~unstable'].accessor(d.f32);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  // TODO: Use the value of gridSizeAccess directly after
  // we fix type inference of accessors.
  const gridSize = d.f32(gridSizeAccess.value);
  const time = d.f32(timeAccess.value);
  const sharpness = d.f32(sharpnessAccess.value);

  const n = perlin3d.sample(d.vec3f(mul(gridSize, input.uv), time));

  // Sharpening
  const sharp = sign(n) * pow(abs(n), 1 - sharpness);

  // Remapping to 0-1 range
  const n01 = sharp * 0.5 + 0.5;

  // Gradient map
  const dark = d.vec3f(0, 0.2, 1);
  const light = d.vec3f(1, 0.3, 0.5);
  return d.vec4f(mix(dark, light, n01), 1);
});

const PerlinCache = perlin3d.dynamicCache();
const dynamicLayout = tgpu.bindGroupLayout(PerlinCache.layout);

const root = await tgpu.init();
const device = root.device;

const perlinCache = PerlinCache.instance(root, d.vec3u(16, 16, 10));

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const gridSizeUniform = root['~unstable'].createUniform(d.f32, 32);
const timeUniform = root['~unstable'].createUniform(d.f32, 0);
const sharpnessUniform = root['~unstable'].createUniform(d.f32, 0.1);

const renderPipeline = root['~unstable']
  .with(gridSizeAccess, gridSizeUniform)
  .with(timeAccess, timeUniform)
  .with(sharpnessAccess, sharpnessUniform)
  .with(perlin3d.getJunctionGradientSlot, PerlinCache.getJunctionGradient)
  .with(PerlinCache.valuesSlot, dynamicLayout.value)
  .withVertex(fullScreenTriangle, {})
  .withFragment(mainFragment, { format: presentationFormat })
  .createPipeline();

function draw() {
  if (abortController.signal.aborted) {
    return;
  }

  timeUniform.write(performance.now() * 0.0002 % 10);

  const dynamicGroup = root.createBindGroup(
    dynamicLayout,
    perlinCache.bindings,
  );

  renderPipeline
    .with(dynamicLayout, dynamicGroup)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(draw);
}

draw();

export const controls = {
  'grid size': {
    initial: '2',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((x) => x.toString()),
    onSelectChange: (value: string) =>
      gridSizeUniform.write(Number.parseInt(value)),
  },
  'sharpness': {
    initial: 0.5,
    min: 0,
    max: 0.99,
    step: 0.01,
    onSliderChange: (value: number) => sharpnessUniform.write(value),
  },
};

export function onCleanup() {
  abortController.abort();
  perlinCache.destroy();
  root.destroy();
}
