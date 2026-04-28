// This example is a from-scratch implementation of Radiance Cascades.
// For @typegpu/radiance-cascades package usage, see the docs:
// https://docs.swmansion.com/TypeGPU/ecosystem/typegpu-radiance-cascades/
// and the packaged example:
// https://docs.swmansion.com/TypeGPU/examples#example=rendering--radiance-cascades-drawing
import * as sdf from '@typegpu/sdf';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { DragController } from './drag-controller.ts';
import { SceneData, sceneData, sceneDataAccess, sceneSDF, updateElementPosition } from './scene.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

const LIGHTING_RESOLUTION = 0.35;
const maxOutputResolution = 1024;

function getCascadeAmount(cascadeProbes: number) {
  const interval0 = 1 / cascadeProbes;
  const maxIntervalStart = 1.5;
  return Math.ceil(Math.log2((maxIntervalStart * 3) / interval0 + 1) / 2);
}

function getCascadeDimensions() {
  const outputProbes = Math.max(1, Math.floor(Math.min(canvas.width, maxOutputResolution)));
  const diagonal = outputProbes * Math.SQRT2;
  const optimalProbes = diagonal * LIGHTING_RESOLUTION;
  const cascadeProbes = 2 ** Math.round(Math.log2(optimalProbes));

  return {
    outputProbes,
    cascadeProbes,
    cascadeDim: cascadeProbes * 2,
    cascadeAmount: getCascadeAmount(cascadeProbes),
  };
}

let dimensions = getCascadeDimensions();

function createCascadeTextures() {
  return Array.from({ length: 2 }, () =>
    root
      .createTexture({
        size: [dimensions.cascadeDim, dimensions.cascadeDim, dimensions.cascadeAmount],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled'),
  );
}

function createRadianceFieldTexture() {
  return root
    .createTexture({
      size: [dimensions.outputProbes, dimensions.outputProbes],
      format: 'rgba16float',
    })
    .$usage('storage', 'sampled');
}

let cascadeTextures = createCascadeTextures();
let radianceFieldTex = createRadianceFieldTexture();

let radianceFieldView = radianceFieldTex.createView(d.texture2d());

let radianceFieldStoreView = radianceFieldTex.createView(d.textureStorage2d('rgba16float'));

const buildRadianceFieldBGL = tgpu.bindGroupLayout({
  src: { texture: d.texture2d(d.f32) },
  srcSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float') },
});

const outputProbesUniform = root.createUniform(d.vec2u, d.vec2u(dimensions.outputProbes));

const radianceSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const sceneDataUniform = root.createUniform(SceneData, sceneData);

const cascadeIndexUniform = root.createUniform(d.u32);
const probesUniform = root.createUniform(d.vec2u);
const cascadeDimUniform = root.createUniform(d.vec2u, d.vec2u(dimensions.cascadeDim));
const cascadeProbesUniform = root.createUniform(d.vec2u, d.vec2u(dimensions.cascadeProbes));
const cascadeAmountUniform = root.createUniform(d.u32, dimensions.cascadeAmount);

const overlayEnabledUniform = root.createUniform(d.u32, 0);
const overlayDebugCascadeUniform = root.createUniform(d.u32, 0);

const cascadePassBGL = tgpu.bindGroupLayout({
  upper: { texture: d.texture2d(d.f32) },
  upperSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float') },
});

const cascadeSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const cascadePassPipeline = root
  .with(sceneDataAccess, sceneDataUniform)
  .createGuardedComputePipeline((x, y) => {
    'use gpu';
    const gid = d.vec2u(x, y);
    const cascadeDim = cascadeDimUniform.$;
    const layer = cascadeIndexUniform.$;
    const probes = probesUniform.$;
    const cascadeProbes = cascadeProbesUniform.$;

    const dirStored = gid.xy / probes;
    const probe = gid.xy % probes;
    const raysDimStored = d.u32(2 << layer);
    const raysDimActual = raysDimStored * 2;
    const rayCountActual = raysDimActual * raysDimActual;

    const probePos = (d.vec2f(probe) + 0.5) / d.vec2f(probes);
    const baseProbeCount = d.f32(cascadeProbes.x);
    const baseRayInterval = 1 / baseProbeCount;
    const rayIntervalScale = d.f32(1 << (layer * 2));
    // Ray intervals are distances in normalized scene space, not texture UV coordinates.
    const rayStartDistance = (baseRayInterval * (rayIntervalScale - 1)) / 3;
    const rayEndDistance = rayStartDistance + baseRayInterval * rayIntervalScale;
    const eps = 0.5 / baseProbeCount;
    const minStep = 0.25 / baseProbeCount;

    let accum = d.vec4f();

    for (const i of tgpu.unroll(std.range(4))) {
      const dirActual = dirStored * 2 + d.vec2u(i & 1, i >> 1);
      const rayIndex = d.f32(dirActual.y * raysDimActual + dirActual.x) + 0.5;
      const angle = (rayIndex / d.f32(rayCountActual)) * (Math.PI * 2) - Math.PI;
      const rayDir = d.vec2f(std.cos(angle), -std.sin(angle));

      let rgb = d.vec3f();
      let T = d.f32(1);
      let t = rayStartDistance;

      for (let step = 0; step < 64; step++) {
        if (t > rayEndDistance) {
          break;
        }
        const hit = sceneSDF(probePos + rayDir * t);
        if (hit.dist <= eps) {
          rgb = d.vec3f(hit.color);
          T = d.f32(0);
          break;
        }
        t += std.max(hit.dist, minStep);
      }

      if (layer + 1 < cascadeAmountUniform.$ && T > 0.01) {
        const probesU = d.vec2u(std.max(probes.x >> 1, 1), std.max(probes.y >> 1, 1));
        const tileOrigin = d.vec2f(dirActual) * d.vec2f(probesU);
        const probePixel = std.clamp(
          probePos * d.vec2f(probesU),
          d.vec2f(0.5),
          d.vec2f(probesU) - 0.5,
        );
        const upperCascadeUv = (tileOrigin + probePixel) / d.vec2f(cascadeDim);

        const upper = std.textureSampleLevel(
          cascadePassBGL.$.upper,
          cascadePassBGL.$.upperSampler,
          upperCascadeUv,
          0,
        );
        rgb += upper.xyz * T;
        T *= upper.w;
      }

      accum += d.vec4f(rgb, T);
    }

    std.textureStore(cascadePassBGL.$.dst, gid.xy, accum * 0.25);
  });

const buildRadianceFieldPipeline = root.createGuardedComputePipeline((x, y) => {
  'use gpu';
  const gid = d.vec2u(x, y);
  const outputProbes = outputProbesUniform.$;
  const cascadeProbes = cascadeProbesUniform.$;
  const cascadeDim = cascadeDimUniform.$;

  const invCascadeDim = d.vec2f(1) / d.vec2f(cascadeDim);
  const uv = (d.vec2f(gid.xy) + 0.5) / d.vec2f(outputProbes);

  const probePixel = std.clamp(
    uv * d.vec2f(cascadeProbes),
    d.vec2f(0.5),
    d.vec2f(cascadeProbes) - 0.5,
  );

  const uvStride = d.vec2f(cascadeProbes) * invCascadeDim;
  const baseSampleUV = probePixel * invCascadeDim;

  let sum = d.vec3f();
  for (const i of tgpu.unroll(std.range(4))) {
    const offset = d.vec2f(d.f32(i & 1), d.f32(i >> 1)) * uvStride;
    sum += std.textureSampleLevel(
      buildRadianceFieldBGL.$.src,
      buildRadianceFieldBGL.$.srcSampler,
      baseSampleUV + offset,
      0,
    ).xyz;
  }

  std.textureStore(buildRadianceFieldBGL.$.dst, gid.xy, d.vec4f(sum * 0.25, 1));
});

const ACESFilm = (x: d.v3f): d.v3f => {
  'use gpu';
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const dVal = 0.59;
  const e = 0.01;
  const res = (x * (x * a + b)) / (x * (x * c + dVal) + e);

  return std.saturate(res);
};

const overlayDebugBGL = tgpu.bindGroupLayout({
  cascadeTex: { texture: d.texture2dArray() },
  cascadeSampler: { sampler: 'filtering' },
});

const overlayFrag = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const field = std.textureSample(radianceFieldView.$, radianceSampler.$, uv).xyz;
  const sceneHit = sceneSDF(uv);
  const fieldColor = ACESFilm(std.saturate(field));
  const surfaceColor = ACESFilm(std.saturate(sceneHit.color));
  const fieldTexel = 1 / d.f32(std.textureDimensions(radianceFieldView.$).x);
  const edgeWidth = std.max(std.fwidth(sceneHit.dist), fieldTexel);
  const surfaceAlpha = 1 - std.smoothstep(-edgeWidth, edgeWidth, sceneHit.dist);
  const baseColor = std.mix(fieldColor, surfaceColor, surfaceAlpha);

  if (overlayEnabledUniform.$ === 0) {
    return d.vec4f(baseColor, 1);
  }

  const debugLayer = overlayDebugCascadeUniform.$;
  const cascadeProbes = cascadeProbesUniform.$;
  const probes = std.max(
    d.vec2u(cascadeProbes.x >> debugLayer, cascadeProbes.y >> debugLayer),
    d.vec2u(1),
  );
  const raysDimStored = d.u32(2) << debugLayer;
  const raysDimActual = raysDimStored * 2;
  const rayCountActual = raysDimActual * raysDimActual;
  const baseProbeCount = d.f32(cascadeProbes.x);
  const baseRayInterval = 1 / baseProbeCount;
  const rayIntervalScale = d.f32(d.u32(1) << (debugLayer * 2));
  const rayEndDistance =
    (baseRayInterval * (rayIntervalScale - 1)) / 3 + baseRayInterval * rayIntervalScale;
  const probeSpacing = 1 / probes.x;
  const probeRadius = std.max(probeSpacing * 0.08, 0.002);
  const rayThickness = std.max(probeSpacing * 0.03, 0.001);

  let minProbeDist = d.f32(1000);
  let minRayDist = d.f32(1000);
  let closestRayColor = d.vec3f();

  const centerProbe = d.vec2i(std.floor(uv * d.vec2f(probes)));

  for (let py = -1; py <= 1; py++) {
    for (let px = -1; px <= 1; px++) {
      const probeXY = centerProbe + d.vec2i(px, py);
      if (
        probeXY.x < 0 ||
        probeXY.x >= d.i32(probes.x) ||
        probeXY.y < 0 ||
        probeXY.y >= d.i32(probes.y)
      ) {
        continue;
      }

      const probe = d.vec2u(probeXY);
      const probePos = (d.vec2f(probe) + 0.5) / d.vec2f(probes);
      minProbeDist = std.min(minProbeDist, sdf.sdDisk(uv - probePos, probeRadius));

      if (std.length(uv - probePos) > probeSpacing * 0.7) {
        continue;
      }

      const rayStep = std.max(1, d.u32(rayCountActual / 24));
      let ri = d.u32(0);
      while (ri < rayCountActual) {
        const rayIndex = d.f32(ri) + 0.5;
        const angle = (rayIndex / rayCountActual) * (Math.PI * 2) - Math.PI;
        const rayDir = d.vec2f(std.cos(angle), -std.sin(angle));
        const rayDist = sdf.sdLine(uv, probePos, probePos + rayDir * std.max(rayEndDistance, 0.01));

        if (rayDist < minRayDist) {
          const dirStored = d.vec2u((ri % raysDimActual) >> 1, d.u32(ri / raysDimActual) >> 1);
          const sample = std.textureLoad(
            overlayDebugBGL.$.cascadeTex,
            d.vec2i(dirStored * probes + probe),
            debugLayer,
            0,
          );
          minRayDist = rayDist;
          closestRayColor = sample.xyz;
        }
        ri += rayStep;
      }
    }
  }

  let overlayColor = d.vec3f();
  let overlayAlpha = d.f32(0);
  if (minRayDist < rayThickness) {
    overlayColor = ACESFilm(std.saturate(closestRayColor));
    overlayAlpha = std.smoothstep(rayThickness * 1.5, rayThickness * 0.3, minRayDist) * 0.8;
  }

  if (std.abs(minProbeDist) < probeRadius * 0.2) {
    const edgeAlpha =
      std.smoothstep(probeRadius * 0.3, probeRadius * 0.1, std.abs(minProbeDist)) * 0.3;
    overlayColor = std.mix(overlayColor, d.vec3f(1, 1, 0), edgeAlpha);
    overlayAlpha = std.max(overlayAlpha, edgeAlpha);
  }

  return d.vec4f(std.mix(baseColor, overlayColor, overlayAlpha), 1);
});

function createCascadePassBindGroups() {
  return Array.from({ length: dimensions.cascadeAmount }, (_, layer) => {
    const writeToA = (dimensions.cascadeAmount - 1 - layer) % 2 === 0;
    const dstTexture = cascadeTextures[writeToA ? 0 : 1];
    const srcTexture = cascadeTextures[writeToA ? 1 : 0];

    return root.createBindGroup(cascadePassBGL, {
      upper: srcTexture.createView(d.texture2d(d.f32), {
        baseArrayLayer: Math.min(layer + 1, dimensions.cascadeAmount - 1),
        arrayLayerCount: 1,
      }),
      upperSampler: cascadeSampler,
      dst: dstTexture.createView(d.textureStorage2d('rgba16float', 'write-only'), {
        baseArrayLayer: layer,
        arrayLayerCount: 1,
      }),
    });
  });
}

let cascadePassBindGroups = createCascadePassBindGroups();

function createBuildRadianceFieldBG(textureIndex: number) {
  return root.createBindGroup(buildRadianceFieldBGL, {
    src: cascadeTextures[textureIndex].createView(d.texture2d(d.f32), {
      baseArrayLayer: 0,
      arrayLayerCount: 1,
    }),
    srcSampler: cascadeSampler,
    dst: radianceFieldStoreView,
  });
}

let buildRadianceFieldBindGroups = [createBuildRadianceFieldBG(0), createBuildRadianceFieldBG(1)];

function buildRadianceField() {
  const cascade0InA = (dimensions.cascadeAmount - 1) % 2 === 0;
  const buildRadianceFieldBG = buildRadianceFieldBindGroups[cascade0InA ? 0 : 1];

  buildRadianceFieldPipeline
    .with(buildRadianceFieldBG)
    .dispatchThreads(dimensions.outputProbes, dimensions.outputProbes);
}

function runCascadesTopDown() {
  for (let layer = dimensions.cascadeAmount - 1; layer >= 0; layer--) {
    const probes = Math.max(1, dimensions.cascadeProbes >> layer);

    cascadeIndexUniform.write(layer);
    probesUniform.write(d.vec2u(probes));

    cascadePassPipeline
      .with(cascadePassBindGroups[layer])
      .dispatchThreads(dimensions.cascadeDim, dimensions.cascadeDim);
  }
}

function updateLighting() {
  runCascadesTopDown();
  buildRadianceField();
}
updateLighting();

function createOverlayDebugBG(textureIndex: number) {
  return root.createBindGroup(overlayDebugBGL, {
    cascadeTex: cascadeTextures[textureIndex].createView(d.texture2dArray(d.f32)),
    cascadeSampler: cascadeSampler,
  });
}

let overlayDebugBindGroups = [createOverlayDebugBG(0), createOverlayDebugBG(1)];

function createRenderPipeline() {
  return root.with(sceneDataAccess, sceneDataUniform).createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: overlayFrag,
  });
}

let renderPipeline = createRenderPipeline();

let frameId: number;
let debugLayer = 0;

function updateCascadeDimensions() {
  dimensions = getCascadeDimensions();
  debugLayer = Math.min(debugLayer, dimensions.cascadeAmount - 1);

  outputProbesUniform.write(d.vec2u(dimensions.outputProbes));
  cascadeDimUniform.write(d.vec2u(dimensions.cascadeDim));
  cascadeProbesUniform.write(d.vec2u(dimensions.cascadeProbes));
  cascadeAmountUniform.write(dimensions.cascadeAmount);
  overlayDebugCascadeUniform.write(debugLayer);
}

function destroySizedResources() {
  for (const texture of cascadeTextures) {
    texture.destroy();
  }
  radianceFieldTex.destroy();
}

function recreateSizedResources() {
  destroySizedResources();
  updateCascadeDimensions();

  cascadeTextures = createCascadeTextures();
  radianceFieldTex = createRadianceFieldTexture();
  radianceFieldView = radianceFieldTex.createView(d.texture2d());
  radianceFieldStoreView = radianceFieldTex.createView(d.textureStorage2d('rgba16float'));

  cascadePassBindGroups = createCascadePassBindGroups();
  buildRadianceFieldBindGroups = [createBuildRadianceFieldBG(0), createBuildRadianceFieldBG(1)];
  overlayDebugBindGroups = [createOverlayDebugBG(0), createOverlayDebugBG(1)];
  renderPipeline = createRenderPipeline();

  updateLighting();
}

function frame() {
  const writeToA = (dimensions.cascadeAmount - 1 - debugLayer) % 2 === 0;
  const overlayDebugBG = overlayDebugBindGroups[writeToA ? 0 : 1];

  renderPipeline.with(overlayDebugBG).withColorAttachment({ view: context }).draw(3);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

function onDrag(id: string, position: d.v2f) {
  updateElementPosition(id, position);
  sceneDataUniform.write(sceneData);
  updateLighting();
}

const dragController = new DragController(canvas, onDrag, onDrag);

// #region Example controls and cleanup

let resizeTimeout: ReturnType<typeof setTimeout>;
const resizeObserver = new ResizeObserver(() => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(recreateSizedResources, 100);
});
resizeObserver.observe(canvas);

export function onCleanup() {
  dragController.destroy();
  resizeObserver.disconnect();
  clearTimeout(resizeTimeout);
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}

export const controls = defineControls({
  'Show Overlay': {
    initial: false,
    onToggleChange: (value: boolean) => {
      overlayEnabledUniform.write(value ? 1 : 0);
    },
  },
  'Cascade Layer': {
    initial: 0,
    min: 0,
    max:
      getCascadeAmount(
        2 ** Math.round(Math.log2(maxOutputResolution * Math.SQRT2 * LIGHTING_RESOLUTION)),
      ) - 1,
    step: 1,
    onSliderChange: (value: number) => {
      debugLayer = Math.min(value, dimensions.cascadeAmount - 1);
      overlayDebugCascadeUniform.write(debugLayer);
    },
  },
});

// #endregion
