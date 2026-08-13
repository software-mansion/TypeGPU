// based on:
// Real-time rendering of volumetric clouds
// by:
// Fredrik Haggstrom

import { tgpu, d, std } from 'typegpu';
import * as common from 'typegpu/common';
import { Camera, setupFirstPersonCamera } from '../../common/setup-first-person-camera.ts';
import { precomputeWeatherTexture } from './weather.ts';
import { precomputeNoiseTexture } from './noise.ts';

// ==========================================

const MAX_STEPS = 128;
const PARALLEL_EPSILON = 1e-5;
const EXTINCTION_PER_WORLD_UNIT = 0.01;
const TRANSMITTANCE_CUTOFF = 0.01;
const VOLUME_ACCENT_DENSITY = 0.0005;
const VOLUME_ACCENT_STRENGTH = 0.3;

const SKY_HORIZON = d.vec3f(0.55, 0.75, 1);
const SKY_ZENITH = d.vec3f(0.1, 0.35, 0.85);
const CLOUD_COLOR = d.vec3f(1);
const VOLUME_ACCENT_COLOR = d.vec3f(1, 0.05, 0.05);

// ==========================================

const root = await tgpu.init({ device: { optionalFeatures: ['timestamp-query'] } });
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({
  canvas,
  alphaMode: 'premultiplied',
});
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

// ==========================================

const Globals = d.struct({
  coverage: d.f32,
  density: d.f32,
  hMin: d.f32,
  hMax: d.f32,
  weatherMapWorldSize: d.f32,
  noiseTextureRepetitions: d.f32,
});

const layout = tgpu.bindGroupLayout({
  globals: { uniform: Globals },
  camera: { uniform: Camera },
  weatherMap: { texture: d.texture2d() },
  noiseTexture: { texture: d.texture3d() },
  sampler: { sampler: 'filtering' },
});

// ==========================================

const intersectCloudSlab = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32],
  d.vec3f, // [startDistance, endDistance, hit -> 1]
)((rayOrigin, rayDir, maxDistance) => {
  'use gpu';

  const hMin = layout.$.globals.hMin;
  const hMax = layout.$.globals.hMax;

  // A horizontal ray inside the infinite slab never reaches a Y boundary,
  // so its interval ends at the camera's far plane.
  if (std.abs(rayDir.y) < PARALLEL_EPSILON) {
    if (rayOrigin.y >= hMin && rayOrigin.y <= hMax) {
      return d.vec3f(0, maxDistance, 1);
    }
    return d.vec3f();
  }

  const firstIntersection = (hMin - rayOrigin.y) / rayDir.y;
  const secondIntersection = (hMax - rayOrigin.y) / rayDir.y;
  const rayStart = std.max(std.min(firstIntersection, secondIntersection), 0);
  const rayEnd = std.min(std.max(firstIntersection, secondIntersection), maxDistance);

  if (rayEnd <= rayStart) {
    return d.vec3f();
  }

  return d.vec3f(rayStart, rayEnd, 1);
});

const renderSkyOrLand = tgpu.fn(
  [d.vec3f, d.vec3f, d.f32, d.vec3f],
  d.vec4f,
)((rayOrigin, rayDir, maxDistance, skyColor) => {
  'use gpu';

  // if (std.abs(rayDir.y) >= PARALLEL_EPSILON) {
  //   const landDistance = (LAND_HEIGHT - rayOrigin.y) / rayDir.y;
  //   if (landDistance >= 0 && landDistance <= maxDistance) {
  //     return d.vec4f(std.mix(LAND_COLOR, skyColor, 0.8), 1);
  //   }
  // }

  return d.vec4f(skyColor, 1);
});

const sampleWeaterMap = tgpu.fn(
  [d.vec3f],
  d.struct({ WMc: d.f32, weatherMapSample: d.vec4f }), // {WMc, [wc0, wc1, wh, wc]}
)((pos) => {
  'use gpu';
  const weatherUV = pos.xz / layout.$.globals.weatherMapWorldSize;
  const swm = std.textureSampleLevel(layout.$.weatherMap, layout.$.sampler, weatherUV, 0); // :)

  return {
    WMc: std.max(swm.r, std.saturate(layout.$.globals.coverage - 0.5) * swm.g * 2),
    weatherMapSample: swm,
  };
});

const remap = tgpu.fn(
  [d.f32, d.f32, d.f32, d.f32, d.f32],
  d.f32,
)((value, oldMin, oldMax, newMin, newMax) => {
  'use gpu';
  const t = (value - oldMin) / (oldMax - oldMin);
  return newMin + t * (newMax - newMin);
});

const sampleNoise = tgpu.fn(
  [d.vec3f],
  d.f32,
)((pos) => {
  'use gpu';
  const noiseUV =
    (layout.$.globals.noiseTextureRepetitions * pos) / layout.$.globals.weatherMapWorldSize;
  const sn = std.textureSampleLevel(layout.$.noiseTexture, layout.$.sampler, noiseUV, 0);
  return remap(sn.r, sn.g * 0.625 + sn.b * 0.25 + sn.a * 0.125 - 1, 1, 0, 1);
});

// ==========================================

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const camera = layout.$.camera;
    const globals = layout.$.globals;

    const ndc = (uv * 2 - 1) * d.vec2f(1, -1);
    const farView = camera.projectionInverse * d.vec4f(ndc, 1, 1);
    const farWorld = camera.viewInverse * d.vec4f(farView.xyz / farView.w, 1);

    const rayOrigin = camera.pos.xyz;
    const rayToFarPlane = farWorld.xyz - rayOrigin;
    const maxDistance = std.length(rayToFarPlane);
    const rayDir = rayToFarPlane / maxDistance;

    const skyMix = std.abs(rayDir.y);
    const skyColor = std.mix(SKY_HORIZON, SKY_ZENITH, skyMix);
    const backgroundColor = renderSkyOrLand(rayOrigin, rayDir, maxDistance, skyColor);
    const cloudInterval = intersectCloudSlab(rayOrigin, rayDir, maxDistance);

    if (cloudInterval.z < 0.5) {
      return backgroundColor;
    }

    const rayStart = rayOrigin + rayDir * cloudInterval.x;
    const step = (cloudInterval.y - cloudInterval.x) / MAX_STEPS;
    let samplePos = rayStart + rayDir * (step * 0.5);
    let transmittance = d.f32(1);
    let cloudLight = d.vec3f();

    for (let i = 0; i < MAX_STEPS; i++) {
      const WM = sampleWeaterMap(samplePos);
      const WMc = WM.WMc;
      const WMSample = WM.weatherMapSample;
      const ph = (samplePos.y - globals.hMin) / (globals.hMax - globals.hMin);
      const wh = WMSample.b;
      const wd = WMSample.a;

      // shape-altering
      const SRb = std.saturate(remap(ph, 0, 0.07, 0, 1));
      const SRt = std.saturate(remap(ph, 0.2 * wh, wh, 1, 0));
      const SA = SRb * SRt;

      // density-altering
      const DRb = ph * std.saturate(remap(ph, 0, 0.15, 0, 1));
      const DRt = std.saturate(remap(ph, 0.9, 1, 1, 0));
      const DA = globals.density * DRb * DRt * wd * 2;

      // sample noise
      const SNsample = sampleNoise(samplePos);
      const SN = std.saturate(remap(SNsample * SA, 1 - globals.coverage * WMc, 1, 0, 1)) * DA;

      const sampleTransmittance = std.exp(-SN * step * EXTINCTION_PER_WORLD_UNIT);
      const sampleOpacity = 1 - sampleTransmittance;
      cloudLight += CLOUD_COLOR * (transmittance * sampleOpacity);
      transmittance *= sampleTransmittance;

      if (transmittance < TRANSMITTANCE_CUTOFF) {
        break;
      }

      samplePos += rayDir * step;
    }

    const finalColor = cloudLight + backgroundColor.rgb * transmittance;
    const volumePathLength = cloudInterval.y - cloudInterval.x;
    const volumeAccent =
      (1 - std.exp(-volumePathLength * VOLUME_ACCENT_DENSITY)) * VOLUME_ACCENT_STRENGTH;

    return d.vec4f(std.mix(finalColor, VOLUME_ACCENT_COLOR, volumeAccent), 1);
  },
  targets: { format: presentationFormat },
});

// ==========================================

const cameraUniform = root.createUniform(Camera);
const weatherTexture = precomputeWeatherTexture(root);
const noiseTexture = precomputeNoiseTexture(root);
const globalsUniform = root.createUniform(Globals, {
  coverage: 0.6,
  density: 1,
  hMin: 400,
  hMax: 2000,
  weatherMapWorldSize: 5000,
  noiseTextureRepetitions: 1,
});
const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
  addressModeU: 'repeat',
  addressModeV: 'repeat',
  addressModeW: 'repeat',
});

// ==========================================

const { cleanupCamera, updatePosition } = setupFirstPersonCamera(
  canvas,
  {
    initPos: d.vec3f(0, 5, 0),
    target: d.vec3f(0, 6, 0), // head in the clouds :)
    fov: Math.PI / 3,
    near: 1,
    far: 10000,
    speed: d.vec3f(44),
  },
  (props) => cameraUniform.patch(props),
);

// ==========================================

const bindGroup = root.createBindGroup(layout, {
  globals: globalsUniform,
  camera: cameraUniform,
  weatherMap: weatherTexture,
  noiseTexture: noiseTexture,
  sampler,
});

// ==========================================

let frameId = 0;
let frameCount = 0;
function frame() {
  frameCount++;
  frameId = requestAnimationFrame(frame);
  updatePosition();
  pipeline
    .with(bindGroup)
    .withPerformanceCallback((start, end) => {
      if (frameCount % 100 === 0) {
        console.log(Number(end - start) / 1000000, 'ms');
      }
    })
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
    })
    .draw(3);
}

frameId = requestAnimationFrame(frame);

export function onCleanup() {
  cancelAnimationFrame(frameId);
  cleanupCamera();
  root.destroy();
}
