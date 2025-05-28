import tgpu, { type TgpuFn } from 'typegpu';
import * as d from 'typegpu/data';
import { perlin3d } from '@typegpu/noise';
import { abs, mix, mul, pow, sign, tanh } from 'typegpu/std';

/** Used for clean-up of this example */
const abortController = new AbortController();

/** The depth of the perlin noise (in time), after which the pattern loops around */
const DEPTH = 10;

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0.0, 1.0),
    uv: mul(0.5, pos[input.vertexIndex]),
  };
});

const gridSizeAccess = tgpu['~unstable'].accessor(d.f32);
const timeAccess = tgpu['~unstable'].accessor(d.f32);
const sharpnessAccess = tgpu['~unstable'].accessor(d.f32);

const exponentialSharpen = tgpu['~unstable'].fn([d.f32], d.f32)((n) => {
  const sharp = sign(n) * pow(abs(n), 1 - sharpnessAccess.value);
  return sharp * 0.5 + 0.5;
});

const tanhSharpen = tgpu['~unstable'].fn([d.f32], d.f32)((n) => {
  const sharp = tanh(n * (1 + sharpnessAccess.value * 10));
  return sharp * 0.5 + 0.5;
});

const sharpenFnSlot = tgpu['~unstable'].slot<TgpuFn<[d.F32], d.F32>>(
  exponentialSharpen,
);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = mul(gridSizeAccess.value, input.uv);

  const n = perlin3d.sample(d.vec3f(uv, timeAccess.value));

  // Apply sharpening function and get normalized result
  const n01 = sharpenFnSlot.value(n);

  // Gradient map
  const dark = d.vec3f(0, 0.2, 1);
  const light = d.vec3f(1, 0.3, 0.5);
  return d.vec4f(mix(dark, light, n01), 1);
});

// Configuring a dynamic (meaning it's size can change) cache
// for perlin noise gradients.
const PerlinCacheConfig = perlin3d.dynamicCacheConfig();

/** Contains all resources that the perlin cache needs access to */
const dynamicLayout = tgpu.bindGroupLayout({ ...PerlinCacheConfig.layout });

const root = await tgpu.init();
const device = root.device;

// Instantiating the cache with an initial size.
const perlinCache = PerlinCacheConfig.instance(root, d.vec3u(4, 4, DEPTH));

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const gridSizeUniform = root['~unstable'].createUniform(d.f32);
const timeUniform = root['~unstable'].createUniform(d.f32, 0);
const sharpnessUniform = root['~unstable'].createUniform(d.f32, 0.1);

const renderPipelineBase = root['~unstable']
  .with(gridSizeAccess, gridSizeUniform)
  .with(timeAccess, timeUniform)
  .with(sharpnessAccess, sharpnessUniform)
  .with(perlin3d.getJunctionGradientSlot, PerlinCacheConfig.getJunctionGradient)
  .with(PerlinCacheConfig.valuesSlot, dynamicLayout.value);

const renderPipelines = {
  exponential: renderPipelineBase
    .with(sharpenFnSlot, exponentialSharpen)
    .withVertex(fullScreenTriangle, {})
    .withFragment(mainFragment, { format: presentationFormat })
    .createPipeline(),
  tanh: renderPipelineBase
    .with(sharpenFnSlot, tanhSharpen)
    .withVertex(fullScreenTriangle, {})
    .withFragment(mainFragment, { format: presentationFormat })
    .createPipeline(),
};

let activeSharpenFn: 'exponential' | 'tanh' = 'exponential';

function draw() {
  if (abortController.signal.aborted) {
    return;
  }

  timeUniform.write(performance.now() * 0.0002 % DEPTH);

  const group = root.createBindGroup(dynamicLayout, perlinCache.bindings);

  renderPipelines[activeSharpenFn]
    .with(dynamicLayout, group)
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
    initial: '4',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      const iSize = Number.parseInt(value);
      perlinCache.size = d.vec3u(iSize, iSize, DEPTH);
      gridSizeUniform.write(iSize);
    },
  },
  'sharpness': {
    initial: 0.5,
    min: 0,
    max: 0.99,
    step: 0.01,
    onSliderChange: (value: number) => sharpnessUniform.write(value),
  },
  'sharpening function': {
    initial: 'exponential',
    options: ['exponential', 'tanh'],
    onSelectChange: (value: 'exponential' | 'tanh') => {
      activeSharpenFn = value;
    },
  },
};

export function onCleanup() {
  abortController.abort();
  perlinCache.destroy();
  root.destroy();
}
