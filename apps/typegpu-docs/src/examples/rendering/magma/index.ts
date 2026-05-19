import tgpu, { common, d, std } from 'typegpu';
import { hexToOklab, oklabToRgb } from '@typegpu/color';
import { perlin2d } from '@typegpu/noise';

// const resizeObserver = new ResizeObserver(() => {
//   const dpr = window.devicePixelRatio || 1;
//   canvas.width = canvas.clientWidth * dpr;
//   canvas.height = canvas.clientHeight * dpr;
// });
// resizeObserver.observe(canvas);

const root = await tgpu.init();
const time = root.createUniform(d.f32);

// oxlint-disable-next-line typescript/no-non-null-assertion
const canvas = document.querySelector<HTMLCanvasElement>('canvas')!;
const context = root.configureContext({ canvas });

const noise = (v: d.v2f) => {
  'use gpu';
  return perlin2d.sample(v);
};

const octavesAccessor = tgpu.accessor(d.u32);
const standardizeNoiseAccessor = tgpu.accessor(d.bool);
const getMaxValue = tgpu.comptime((octaves: number) => 1 - 2 ** -octaves);
const rotation = d.mat2x2f(0.8, 0.6, -0.6, 0.8);

const fbm = tgpu.fn((v: d.v2f) => {
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
});

const fbm4 = fbm.with(octavesAccessor, 4).with(standardizeNoiseAccessor, false);
const fbm6 = fbm.with(octavesAccessor, 6).with(standardizeNoiseAccessor, true);

const domainWarp = (v: d.v2f) => {
  'use gpu';
  return fbm6(v + fbm4(v + fbm4(v)));
};

const palette = (t: number) => {
  'use gpu';
  // Magma colors
  const darkRock = hexToOklab('#1a0500'); // Very dark reddish-black crust
  const deepRed = hexToOklab('#b30000'); // Deep, dark lava
  const hotOrange = hexToOklab('#ff5500'); // Vibrant fiery orange
  const brightYellow = hexToOklab('#ffcc00'); // Blinding hot yellow for the peaks

  // Tight transitions across the noise space
  const factor1 = std.smoothstep(0.35, 0.45, t);
  const factor2 = std.smoothstep(0.45, 0.6, t);
  const factor3 = std.smoothstep(0.6, 0.7, t);

  // Branchless mixing cascade
  const mix1 = std.mix(darkRock, deepRed, factor1);
  const mix2 = std.mix(mix1, hotOrange, factor2);
  const finalMix = std.mix(mix2, brightYellow, factor3);

  return oklabToRgb(finalMix);
};

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const centeredUV = 2 * uv - 1;

    const sample = domainWarp(centeredUV);
    const heightScale = 0.3;
    const position3D = d.vec3f(centeredUV.x, centeredUV.y, sample * heightScale);

    const dx = std.dpdx(position3D);
    const dy = std.dpdy(position3D);

    const normal = std.normalize(std.cross(dx, dy));

    // todo - check the rest

    const lightDir = std.normalize(d.vec3f(1.0, 1.0, 1.0));
    const diffuse = std.max(0.0, std.dot(normal, lightDir));

    const viewDir = d.vec3f(0.0, 0.0, 1.0);

    const halfDir = std.normalize(lightDir + viewDir);

    const shininess = d.f32(42.0);
    const specularStrength = 0.6;
    const specFactor = std.pow(std.max(0.0, std.dot(normal, halfDir)), shininess);

    const specular = d.vec3f(1.0, 1.0, 1.0) * specFactor * specularStrength;

    const baseColor = palette(sample);

    const litColor = baseColor * (diffuse * 0.8 + 0.2) + specular;

    const glow = std.smoothstep(0.5, 0.65, sample);
    const finalMagma = std.mix(litColor, baseColor, glow);

    return d.vec4f(finalMagma, 1);
  },
});

let elapsed = 0;
let lastTimestamp: number | null = null;

function render(timestamp: number) {
  if (lastTimestamp !== null) {
    elapsed += (timestamp - lastTimestamp) / 10000.0;
  }
  lastTimestamp = timestamp;

  time.write(elapsed);

  pipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
