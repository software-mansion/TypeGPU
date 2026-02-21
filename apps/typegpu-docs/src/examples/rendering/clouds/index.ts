import tgpu, { common, d, std } from 'typegpu';
import {
  FOV_FACTOR,
  NOISE_TEXTURE_SIZE,
  SKY_HORIZON,
  SKY_ZENITH_TINT,
  SUN_BRIGHTNESS,
  SUN_DIRECTION,
  SUN_GLOW,
  WIND_SPEED,
} from './consts.ts';
import { raymarch } from './utils.ts';
import { cloudsLayout, CloudsParams } from './types.ts';
import { randf } from '@typegpu/noise';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const paramsUniform = root.createUniform(CloudsParams, {
  time: 0,
  maxSteps: 50,
  maxDistance: 10.0,
});
const resolutionUniform = root.createUniform(
  d.vec2f,
  d.vec2f(canvas.width, canvas.height),
);

const noiseData = new Uint8Array(NOISE_TEXTURE_SIZE * NOISE_TEXTURE_SIZE);
for (let i = 0; i < noiseData.length; i += 1) {
  noiseData[i] = Math.random() * 255;
}

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
});

const noiseTexture = root['~unstable']
  .createTexture({
    size: [NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE],
    format: 'r8unorm',
  })
  .$usage('sampled', 'render');
noiseTexture.write(noiseData);

const bindGroup = root.createBindGroup(cloudsLayout, {
  params: paramsUniform.buffer,
  noiseTexture,
  sampler,
});

const mainFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  randf.seed2(uv.mul(cloudsLayout.$.params.time));
  const screenRes = resolutionUniform.$;
  const aspect = screenRes.x / screenRes.y;

  let screenPos = std.mul(std.sub(uv, 0.5), 2.0);
  screenPos = d.vec2f(
    screenPos.x * std.max(aspect, 1.0),
    screenPos.y * std.max(1.0 / aspect, 1.0),
  );

  const sunDir = std.normalize(SUN_DIRECTION);
  const time = cloudsLayout.$.params.time;
  const rayOrigin = d.vec3f(
    std.sin(time * 0.6) * 0.5,
    std.cos(time * 0.8) * 0.5 - 1,
    time * WIND_SPEED,
  );
  const rayDir = std.normalize(d.vec3f(screenPos.x, screenPos.y, FOV_FACTOR));

  const sunDot = std.clamp(std.dot(rayDir, sunDir), 0.0, 1.0);
  const sunGlow = std.pow(
    sunDot,
    1.0 / (SUN_BRIGHTNESS * SUN_BRIGHTNESS * SUN_BRIGHTNESS),
  );

  let skyCol = std.sub(SKY_HORIZON, std.mul(SKY_ZENITH_TINT, rayDir.y * 0.35));
  skyCol = std.add(skyCol, std.mul(SUN_GLOW, sunGlow));

  const cloudCol = raymarch(rayOrigin, rayDir, sunDir);
  const finalCol = std.add(std.mul(skyCol, 1.1 - cloudCol.a), cloudCol.rgb);

  return d.vec4f(finalCol, 1.0);
});

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: mainFragment,
  targets: { format: presentationFormat },
});

const resizeObserver = new ResizeObserver(() => {
  resolutionUniform.write(d.vec2f(canvas.width, canvas.height));
});
resizeObserver.observe(canvas);

let frameId: number;

function render() {
  paramsUniform.writePartial({ time: (performance.now() / 1000) % 500 });

  pipeline
    .with(bindGroup)
    .withColorAttachment({
      view: context,
      clearValue: [0, 0, 0, 1],
    })
    .draw(6);

  frameId = requestAnimationFrame(render);
}

frameId = requestAnimationFrame(render);

const qualityOptions = {
  'very high': {
    maxSteps: 150,
    maxDistance: 13.0,
  },
  high: {
    maxSteps: 100,
    maxDistance: 12.0,
  },
  medium: {
    maxSteps: 50,
    maxDistance: 10.0,
  },
  low: {
    maxSteps: 30,
    maxDistance: 6.0,
  },
  'very low': {
    maxSteps: 15,
    maxDistance: 4.0,
  },
} as Record<string, Partial<d.Infer<typeof CloudsParams>>>;

export const controls = defineControls({
  Quality: {
    initial: 'medium',
    options: ['very high', 'high', 'medium', 'low', 'very low'],
    onSelectChange(value) {
      paramsUniform.writePartial(qualityOptions[value]);
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  resizeObserver.disconnect();
  root.destroy();
}
