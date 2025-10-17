import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { fullScreenTriangle } from 'typegpu/common';
import { perlin3d } from '@typegpu/noise';
import { abs, mix, mul, pow, sign, tanh } from 'typegpu/std';

/** The depth of the perlin noise (in time), after which the pattern loops around */
const DEPTH = 10;

const gridSizeAccess = tgpu['~unstable'].accessor(d.f32);
const timeAccess = tgpu['~unstable'].accessor(d.f32);
const sharpnessAccess = tgpu['~unstable'].accessor(d.f32);

const exponentialSharpen = (n: number, sharpness: number): number => {
  'use gpu';
  return sign(n) * pow(abs(n), 1 - sharpness);
};

const tanhSharpen = (n: number, sharpness: number): number => {
  'use gpu';
  return tanh(n * (1 + sharpness * 10));
};

const sharpenFnSlot = tgpu.slot<(n: number, sharpness: number) => number>(
  exponentialSharpen,
);

const mainFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = mul(gridSizeAccess.$, input.uv);

  const n = perlin3d.sample(d.vec3f(uv, timeAccess.$));

  // Apply sharpening function
  const sharp = sharpenFnSlot.$(n, sharpnessAccess.$);

  // Map to 0-1 range
  const n01 = sharp * 0.5 + 0.5;

  // Gradient map
  const dark = d.vec3f(0, 0.2, 1);
  const light = d.vec3f(1, 0.3, 0.5);
  return d.vec4f(mix(dark, light, n01), 1);
});

// Configuring a dynamic (meaning it's size can change) cache
// for perlin noise gradients.
const perlinCacheConfig = perlin3d.dynamicCacheConfig();

/** Contains all resources that the perlin cache needs access to */
const dynamicLayout = tgpu.bindGroupLayout({ ...perlinCacheConfig.layout });

const root = await tgpu.init();
const device = root.device;

// Instantiating the cache with an initial size.
const perlinCache = perlinCacheConfig.instance(root, d.vec3u(4, 4, DEPTH));

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const gridSize = root.createUniform(d.f32);
const time = root.createUniform(d.f32, 0);
const sharpness = root.createUniform(d.f32, 0.1);

const renderPipelineBase = root['~unstable']
  .with(gridSizeAccess, gridSize)
  .with(timeAccess, time)
  .with(sharpnessAccess, sharpness)
  .pipe(perlinCacheConfig.inject(dynamicLayout.$));

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

let isRunning = true;
let bindGroup = root.createBindGroup(dynamicLayout, perlinCache.bindings);

function draw(timestamp: number) {
  if (!isRunning) {
    return;
  }

  time.write(timestamp * 0.0002 % DEPTH);

  renderPipelines[activeSharpenFn]
    .with(bindGroup)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

export const controls = {
  'grid size': {
    initial: '4',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      const iSize = Number.parseInt(value);
      perlinCache.size = d.vec3u(iSize, iSize, DEPTH);
      gridSize.write(iSize);
      bindGroup = root.createBindGroup(dynamicLayout, perlinCache.bindings);
    },
  },
  'sharpness': {
    initial: 0.5,
    min: 0,
    max: 0.99,
    step: 0.01,
    onSliderChange: (value: number) => sharpness.write(value),
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
  isRunning = false;
  root.destroy();
}
