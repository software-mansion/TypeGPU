import { perlin3d } from '@typegpu/noise';
import tgpu, { common, d } from 'typegpu';
import { abs, mix, mul, pow, sign, tanh } from 'typegpu/std';
import { defineControls } from '../../common/defineControls.ts';

/** The depth of the perlin noise (in time), after which the pattern loops around */
const DEPTH = 10;

const exponentialSharpen = (n: number, sharpness: number): number => {
  'use gpu';
  return sign(n) * pow(abs(n), 1 - sharpness);
};

const tanhSharpen = (n: number, sharpness: number): number => {
  'use gpu';
  return tanh(n * (1 + sharpness * 10));
};

// Configuring a dynamic (meaning it's size can change) cache
// for perlin noise gradients.
const perlinCacheConfig = perlin3d.dynamicCacheConfig();

/** Contains all resources that the perlin cache needs access to */
const dynamicLayout = tgpu.bindGroupLayout({ ...perlinCacheConfig.layout });

const root = await tgpu.init();

const gridSize = root.createUniform(d.f32);
const time = root.createUniform(d.f32, 0);
const sharpness = root.createUniform(d.f32, 0.1);

// Instantiating the cache with an initial size.
const perlinCache = perlinCacheConfig.instance(root, d.vec3u(4, 4, DEPTH));

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const createRenderPipeline = (
  sharpenFn: (n: number, sharpness: number) => number,
) =>
  root
    .pipe(perlinCacheConfig.inject(dynamicLayout.$))
    .createRenderPipeline({
      vertex: common.fullScreenTriangle,
      fragment: ({ uv }) => {
        'use gpu';
        const suv = mul(gridSize.$, uv);
        const n = perlin3d.sample(d.vec3f(suv, time.$));

        // Apply sharpening function
        const sharp = sharpenFn(n, sharpness.$);

        // Map to 0-1 range
        const n01 = sharp * 0.5 + 0.5;

        // Gradient map
        const dark = d.vec3f(0, 0.2, 1);
        const light = d.vec3f(1, 0.3, 0.5);
        return d.vec4f(mix(dark, light, n01), 1);
      },
    });

const renderPipelines = {
  exponential: createRenderPipeline(exponentialSharpen),
  tanh: createRenderPipeline(tanhSharpen),
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
    .withColorAttachment({ view: context })
    .draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

export const controls = defineControls({
  'grid size': {
    initial: '4',
    options: [1, 2, 4, 8, 16, 32, 64, 128, 256].map((x) => x.toString()),
    onSelectChange: (value: string) => {
      const iSize = Number.parseInt(value, 10);
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
    onSelectChange: (value) => {
      activeSharpenFn = value;
    },
  },
});

export function onCleanup() {
  isRunning = false;
  root.destroy();
}
