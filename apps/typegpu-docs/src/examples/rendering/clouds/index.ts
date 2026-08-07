import { tgpu, common, d, std } from 'typegpu';
import {
  CLOUD_RENDER_SCALE,
  DENSITY_TEXTURE_SIZE,
  FOV_FACTOR,
  NOISE_TEXTURE_SIZE,
  SKY_HORIZON,
  SKY_ZENITH_TINT,
  SUN_BRIGHTNESS,
  SUN_DIRECTION,
  SUN_GLOW,
  WIND_SPEED,
} from './consts.ts';
import { precomputeDensity, raymarch } from './utils.ts';
import { upscaleLayout, cloudsLayout, CloudsParams, precomputeDensityLayout } from './types.ts';
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
const resolutionUniform = root.createUniform(d.vec2f, d.vec2f(canvas.width, canvas.height));

const noiseData = new Uint8Array(NOISE_TEXTURE_SIZE * NOISE_TEXTURE_SIZE);
for (let i = 0; i < noiseData.length; i += 1) {
  noiseData[i] = Math.random() * 255;
}

const densitySampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  addressModeW: 'repeat',
});

const upscaleSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
});

const noiseTexture = root
  .createTexture({
    size: [NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE],
    format: 'r8unorm',
  })
  .$usage('sampled', 'render');
noiseTexture.write(noiseData);

const densityTexture = root
  .createTexture({
    size: [DENSITY_TEXTURE_SIZE, DENSITY_TEXTURE_SIZE, DENSITY_TEXTURE_SIZE],
    dimension: '3d',
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'storage');

const densityWriteView = densityTexture.createView(d.textureStorage3d('rgba8unorm', 'write-only'));
const densityReadView = densityTexture.createView(d.texture3d());

const precomputeDensityBindGroup = root.createBindGroup(precomputeDensityLayout, {
  params: paramsUniform.buffer,
  noiseTexture,
  sampler: densitySampler,
  densityTexture: densityWriteView,
});

const cloudsBindGroup = root.createBindGroup(cloudsLayout, {
  params: paramsUniform.buffer,
  densityTexture: densityReadView,
  sampler: densitySampler,
});

const precomputeDensityPipeline = root.createGuardedComputePipeline(precomputeDensity);
precomputeDensityPipeline
  .with(precomputeDensityBindGroup)
  .dispatchThreads(DENSITY_TEXTURE_SIZE, DENSITY_TEXTURE_SIZE, DENSITY_TEXTURE_SIZE);

const getRayDirection = tgpu.fn(
  [d.vec2f],
  d.vec3f,
)((uv) => {
  'use gpu';
  const screenRes = resolutionUniform.$;
  const aspect = screenRes.x / screenRes.y;

  let screenPos = (uv - 0.5) * 2;
  screenPos = d.vec2f(screenPos.x * std.max(aspect, 1), screenPos.y * std.max(1 / aspect, 1));

  return std.normalize(d.vec3f(screenPos.x, screenPos.y, FOV_FACTOR));
});

const cloudPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const time = cloudsLayout.$.params.time;
    randf.seed2(uv * time);
    const rayOrigin = d.vec3f(
      std.sin(time * 0.6) * 0.5,
      std.cos(time * 0.8) * 0.5 - 1,
      time * WIND_SPEED,
    );
    const rayDir = getRayDirection(uv);

    return raymarch(rayOrigin, rayDir);
  },
  targets: { format: 'rgba8unorm' },
});

const upscalePipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const rayDir = getRayDirection(uv);
    const sunDir = std.normalize(SUN_DIRECTION);

    const sunDot = std.saturate(std.dot(rayDir, sunDir));
    const sunGlow = sunDot ** (1 / SUN_BRIGHTNESS ** 3);

    let skyCol = SKY_HORIZON - SKY_ZENITH_TINT * rayDir.y * 0.35;
    skyCol += SUN_GLOW * sunGlow;

    const halfTexel = 0.5 / d.vec2f(std.textureDimensions(upscaleLayout.$.cloudTexture));

    let cloudCol = d.vec4f();
    for (const dx of tgpu.unroll([-1, 1])) {
      for (const dy of tgpu.unroll([-1, 1])) {
        cloudCol +=
          std.textureSample(
            upscaleLayout.$.cloudTexture,
            upscaleLayout.$.sampler,
            uv + halfTexel * d.vec2f(dx, dy),
          ) * 0.25;
      }
    }

    const finalCol = skyCol * (1.1 - cloudCol.a) + cloudCol.rgb;

    return d.vec4f(finalCol, 1.0);
  },
  targets: { format: presentationFormat },
});

function getCloudTargetSize() {
  return [
    Math.max(1, Math.floor(canvas.width * CLOUD_RENDER_SCALE)),
    Math.max(1, Math.floor(canvas.height * CLOUD_RENDER_SCALE)),
  ] as const;
}

function createCloudTarget(width: number, height: number) {
  const texture = root
    .createTexture({
      size: [width, height],
      format: 'rgba8unorm',
    })
    .$usage('render', 'sampled');
  const view = texture.createView();

  return { texture, view, width, height };
}

const [initialCloudWidth, initialCloudHeight] = getCloudTargetSize();
let cloudTarget = createCloudTarget(initialCloudWidth, initialCloudHeight);

function createCloudCompositeBindGroup() {
  return root.createBindGroup(upscaleLayout, {
    cloudTexture: cloudTarget.view,
    sampler: upscaleSampler,
  });
}

let cloudCompositeBindGroup = createCloudCompositeBindGroup();

const resizeObserver = new ResizeObserver(() => {
  resolutionUniform.write(d.vec2f(canvas.width, canvas.height));

  const [width, height] = getCloudTargetSize();
  if (width === cloudTarget.width && height === cloudTarget.height) {
    return;
  }

  const previousCloudTarget = cloudTarget;
  cloudTarget = createCloudTarget(width, height);
  cloudCompositeBindGroup = createCloudCompositeBindGroup();
  previousCloudTarget.texture.destroy();
});
resizeObserver.observe(canvas);

let frameId: number;

function render(timestamp: number) {
  paramsUniform.patch({ time: (timestamp / 1000) % 500 });

  cloudPipeline
    .with(cloudsBindGroup)
    .withColorAttachment({
      view: cloudTarget.view,
      clearValue: [0, 0, 0, 0],
    })
    .draw(3);

  upscalePipeline
    .with(cloudCompositeBindGroup)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [0, 0, 0, 1],
    })
    .draw(3);

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
      paramsUniform.patch(qualityOptions[value]);
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  resizeObserver.disconnect();
  cloudTarget.texture.destroy();
  root.destroy();
}
