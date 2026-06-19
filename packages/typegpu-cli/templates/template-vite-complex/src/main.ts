import tgpu, { common, d, std } from 'typegpu';
import { hexToOklab, oklabToRgb } from '@typegpu/color';
import { perlin2d } from '@typegpu/noise';

// Wiring up the speed slider
const slider = document.querySelector<HTMLInputElement>('#slider') as HTMLInputElement;
let speed = Number(slider.value);
slider.addEventListener('input', () => {
  speed = Number(slider.value);
});

// Initializing TypeGPU
const root = await tgpu.init();

const time = root.createUniform(d.f32);

const canvas = document.querySelector<HTMLCanvasElement>('#canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

// Adjusting the resolution when the physical size of the canvas changes
common.attachAutoResizer({ root, canvas });

function noise(v: d.v2f) {
  'use gpu';
  return perlin2d.sample(v);
}

const octavesAccessor = tgpu.accessor(d.u32);
const standardizeNoiseAccessor = tgpu.accessor(d.bool);
const getMaxValue = tgpu.comptime((octaves: number) => 1 - 2 ** -octaves);
const rotation = d.mat2x2f(0.8, 0.6, -0.6, 0.8);

function fbm(v: d.v2f) {
  'use gpu';
  let u = d.vec2f(v);
  let f = d.f32();

  // first octave
  {
    let sample = noise(u + time.$);
    if (standardizeNoiseAccessor.$) sample = sample * 0.5 + 0.5;
    f += 0.5 * sample;
    u = rotation * u * 2.01;
  }

  for (const i of tgpu.unroll(std.range(2, octavesAccessor.$))) {
    let sample = noise(u);
    if (standardizeNoiseAccessor.$) sample = sample * 0.5 + 0.5;
    f += 0.5 ** i * sample;
    u = rotation * u * (2 + i / 100);
  }

  // last octave
  {
    let sample = noise(u + std.sin(time.$));
    if (standardizeNoiseAccessor.$) sample = sample * 0.5 + 0.5;
    f += 0.5 ** d.f32(octavesAccessor.$) * sample;
    u = rotation * u * 2.01;
  }

  return f / getMaxValue(octavesAccessor.$);
}

const fbm4 = tgpu.fn(fbm).with(octavesAccessor, 4).with(standardizeNoiseAccessor, false);
const fbm6 = tgpu.fn(fbm).with(octavesAccessor, 6).with(standardizeNoiseAccessor, true);

function domainWarp(v: d.v2f) {
  'use gpu';
  return fbm6(v + fbm4(v + fbm4(v)));
}

function palette(t: number) {
  'use gpu';
  const purple = hexToOklab('#c04bf2');
  const blue = hexToOklab('#4e65f6');
  const dark = hexToOklab('#0f092b');

  const factor1 = std.smoothstep(0.25, 0.5, t);

  const factor2 = std.smoothstep(0.5, 0.7, t);

  const mixed = std.mix(std.mix(dark, blue, factor1), purple, factor2);

  return oklabToRgb(mixed);
}

const VIRTUAL_GRID_SIZE = 4;
const EPS = 0.04;
const DIFF_SCALE = 0.4;

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const centeredUV = (2 * uv - 1) * VIRTUAL_GRID_SIZE;

    const sample = domainWarp(centeredUV);
    const sampleRight = domainWarp(centeredUV + d.vec2f(EPS, 0));
    const sampleDown = domainWarp(centeredUV + d.vec2f(0, EPS));

    const dx = d.vec3f(EPS, 0, (sampleRight - sample) * DIFF_SCALE);
    const dy = d.vec3f(0, EPS, (sampleDown - sample) * DIFF_SCALE);

    const normal = std.normalize(std.cross(dx, dy));

    const lightDir = std.normalize(d.vec3f(0.0, -1.0, 1.0));
    const diffuse = std.max(0.0, std.dot(normal, lightDir));

    const baseColor = palette(sample);

    const litColor = baseColor * diffuse;

    return d.vec4f(litColor, 1);
  },
});

let elapsed = 0;
let lastTimestamp: number | null = null;

function frame(timestamp: number) {
  if (lastTimestamp !== null) {
    elapsed += ((timestamp - lastTimestamp) / 1000.0) * speed;
  }
  lastTimestamp = timestamp;

  time.write(elapsed);
  pipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
