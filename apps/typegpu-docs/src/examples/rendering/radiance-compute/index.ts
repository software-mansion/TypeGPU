import * as sdf from '@typegpu/sdf';
import tgpu, {
  type SampledFlag,
  type StorageFlag,
  type TgpuTexture,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { DragController } from './drag-controller.ts';
import {
  SceneData,
  sceneData,
  sceneDataAccess,
  sceneSDF,
  updateElementPosition,
} from './scene.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

const OUTPUT_RESOLUTION: [number, number] = [canvas.width, canvas.height];
const LIGHTING_RESOLUTION = 0.35;

const [outputProbesX, outputProbesY] = OUTPUT_RESOLUTION;
const aspect = outputProbesX / outputProbesY;

const diagonal = Math.sqrt(outputProbesX ** 2 + outputProbesY ** 2);
const optimalProbes = diagonal * LIGHTING_RESOLUTION;
const cascadeProbesMin = 2 ** Math.round(Math.log2(optimalProbes));
const cascadeProbesX = aspect >= 1
  ? Math.round(cascadeProbesMin * aspect)
  : cascadeProbesMin;
const cascadeProbesY = aspect >= 1
  ? cascadeProbesMin
  : Math.round(cascadeProbesMin / aspect);
const cascadeDimX = cascadeProbesX * 2;
const cascadeDimY = cascadeProbesY * 2;

const interval0 = 1 / cascadeProbesMin;
const maxIntervalStart = 1.5;
const cascadeAmount = Math.ceil(
  Math.log2((maxIntervalStart * 3) / interval0 + 1) / 2,
);

type CascadeTexture =
  & TgpuTexture<{
    size: [number, number, number];
    format: 'rgba16float';
  }>
  & StorageFlag
  & SampledFlag;

const cascadeTextures = Array.from(
  { length: 2 },
  () =>
    root['~unstable']
      .createTexture({
        size: [cascadeDimX, cascadeDimY, cascadeAmount],
        format: 'rgba16float',
      })
      .$usage('storage', 'sampled'),
) as [CascadeTexture, CascadeTexture];

const radianceFieldTex = root['~unstable']
  .createTexture({
    size: [outputProbesX, outputProbesY],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const radianceFieldView = radianceFieldTex.createView(d.texture2d());

const radianceFieldStoreView = radianceFieldTex.createView(
  d.textureStorage2d('rgba16float', 'write-only'),
);

const buildRadianceFieldBGL = tgpu.bindGroupLayout({
  src: { texture: d.texture2d(d.f32) },
  srcSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const outputProbesUniform = root.createUniform(
  d.vec2u,
  d.vec2u(outputProbesX, outputProbesY),
);

const radianceSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const sceneDataUniform = root.createUniform(SceneData, sceneData);

const cascadeIndexUniform = root.createUniform(d.u32);
const probesUniform = root.createUniform(d.vec2u);
const cascadeDimUniform = root.createUniform(
  d.vec2u,
  d.vec2u(cascadeDimX, cascadeDimY),
);
const cascadeProbesUniform = root.createUniform(
  d.vec2u,
  d.vec2u(cascadeProbesX, cascadeProbesY),
);

const overlayEnabledUniform = root.createUniform(d.u32, 0);
const overlayDebugCascadeUniform = root.createUniform(d.u32, 0);

const atlasPos = (dir: d.v2u, probe: d.v2u, probes: d.v2u) => {
  'use gpu';
  return dir.mul(probes).add(probe);
};

const cascadePassBGL = tgpu.bindGroupLayout({
  upper: { texture: d.texture2d(d.f32) },
  upperSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const cascadeSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
});

const cascadePassCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const dim2 = cascadeDimUniform.$;
  if (gid.x >= dim2.x || gid.y >= dim2.y) {
    return;
  }

  const layer = cascadeIndexUniform.$;
  const probes = probesUniform.$;
  const cascadeProbes = cascadeProbesUniform.$;

  // Decode atlas position to (direction, probe) using direction-first layout
  const dirStored = gid.xy.div(probes);
  const probe = std.mod(gid.xy, probes);

  // Each stored texel = 2x2 actual rays; raysDimStored doubles per layer
  const raysDimStored = d.u32(2) << layer;
  const raysDimActual = raysDimStored * d.u32(2);
  const rayCountActual = raysDimActual * raysDimActual;

  // Skip texels outside valid atlas region
  if (dirStored.x >= raysDimStored || dirStored.y >= raysDimStored) {
    std.textureStore(cascadePassBGL.$.dst, gid.xy, d.vec4f(0, 0, 0, 1));
    return;
  }

  const probePos = d.vec2f(probe).add(0.5).div(d.vec2f(probes));

  // Interval: each layer covers 4× the distance of the previous
  // Use min probe dimension for uniform spacing in both directions
  const cascadeProbesMinVal = d.f32(std.min(cascadeProbes.x, cascadeProbes.y));
  const interval0 = 1.0 / cascadeProbesMinVal;
  const pow4 = d.f32(d.u32(1) << (layer * d.u32(2)));
  const startUv = (interval0 * (pow4 - 1.0)) / 3.0;
  const endUv = startUv + interval0 * pow4;
  const eps = 0.5 / cascadeProbesMinVal;
  const minStep = 0.25 / cascadeProbesMinVal;

  let accum = d.vec4f();

  // Cast 4 rays per stored texel (2x2 block) and average
  for (let i = 0; i < 4; i++) {
    const dirActual = dirStored
      .mul(d.u32(2))
      .add(d.vec2u(d.u32(i) & d.u32(1), d.u32(i) >> d.u32(1)));
    const rayIndex = d.f32(dirActual.y * raysDimActual + dirActual.x) + 0.5;
    const angle = (rayIndex / d.f32(rayCountActual)) * (Math.PI * 2) - Math.PI;
    const rayDir = d.vec2f(std.cos(angle), -std.sin(angle));

    let rgb = d.vec3f();
    let T = d.f32(1);
    let t = startUv;

    for (let step = 0; step < 32; step++) {
      if (t > endUv) break;
      const hit = sceneSDF(probePos.add(rayDir.mul(t)));
      if (hit.dist <= eps) {
        rgb = d.vec3f(hit.color);
        T = d.f32(0);
        break;
      }
      t += std.max(hit.dist, minStep);
    }

    // Merge with upper cascade if ray didn't hit anything
    if (layer < d.u32(cascadeAmount - 1) && T > 0.01) {
      const probesU = d.vec2u(
        std.max(probes.x >> d.u32(1), d.u32(1)),
        std.max(probes.y >> d.u32(1), d.u32(1)),
      );
      const tileOrigin = d.vec2f(dirActual).mul(d.vec2f(probesU));
      const probePixel = std.clamp(
        probePos.mul(d.vec2f(probesU)),
        d.vec2f(0.5),
        d.vec2f(probesU).sub(0.5),
      );
      const uvU = tileOrigin.add(probePixel).div(d.vec2f(dim2));

      const upper = std.textureSampleLevel(
        cascadePassBGL.$.upper,
        cascadePassBGL.$.upperSampler,
        uvU,
        0,
      );
      rgb = rgb.add(upper.xyz.mul(T));
      T = T * upper.w;
    }

    accum = accum.add(d.vec4f(rgb, T));
  }

  std.textureStore(cascadePassBGL.$.dst, gid.xy, accum.mul(0.25));
});

const buildRadianceFieldCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const outputProbes = outputProbesUniform.$;
  if (gid.x >= outputProbes.x || gid.y >= outputProbes.y) return;

  const cascadeProbes = cascadeProbesUniform.$;
  const cascadeDim = cascadeDimUniform.$;

  const invCascadeDim = d.vec2f(1.0).div(d.vec2f(cascadeDim));
  const uv = d.vec2f(gid.xy).add(0.5).div(d.vec2f(outputProbes));

  const probePixel = std.clamp(
    uv.mul(d.vec2f(cascadeProbes)),
    d.vec2f(0.5),
    d.vec2f(cascadeProbes).sub(0.5),
  );

  const uvStride = d.vec2f(cascadeProbes).mul(invCascadeDim);
  const baseSampleUV = probePixel.mul(invCascadeDim);

  // Sample Tile (0, 0)
  let sum = std.textureSampleLevel(
    buildRadianceFieldBGL.$.src,
    buildRadianceFieldBGL.$.srcSampler,
    baseSampleUV,
    0,
  ).xyz;

  // Sample Tile (1, 0)
  sum = sum.add(
    std.textureSampleLevel(
      buildRadianceFieldBGL.$.src,
      buildRadianceFieldBGL.$.srcSampler,
      baseSampleUV.add(d.vec2f(uvStride.x, 0.0)),
      0,
    ).xyz,
  );

  // Sample Tile (0, 1)
  sum = sum.add(
    std.textureSampleLevel(
      buildRadianceFieldBGL.$.src,
      buildRadianceFieldBGL.$.srcSampler,
      baseSampleUV.add(d.vec2f(0.0, uvStride.y)),
      0,
    ).xyz,
  );

  // Sample Tile (1, 1)
  sum = sum.add(
    std.textureSampleLevel(
      buildRadianceFieldBGL.$.src,
      buildRadianceFieldBGL.$.srcSampler,
      baseSampleUV.add(uvStride),
      0,
    ).xyz,
  );

  std.textureStore(
    buildRadianceFieldBGL.$.dst,
    gid.xy,
    d.vec4f(sum.mul(0.25), 1),
  );
});

const ACESFilm = tgpu.fn(
  [d.vec3f],
  d.vec3f,
)((x) => {
  const a = 2.51;
  const b = 0.03;
  const c = 2.43;
  const dVal = 0.59;
  const e = 0.01;
  const res = x.mul(x.mul(a).add(b)).div(x.mul(x.mul(c).add(dVal)).add(e));
  return std.saturate(res);
});

const finalRadianceFieldFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const field = std.textureSample(
    radianceFieldView.$,
    radianceSampler.$,
    uv,
  ).xyz;
  const outRgb = std.saturate(field);
  return d.vec4f(ACESFilm(outRgb), 1.0);
});

const overlayDebugBGL = tgpu.bindGroupLayout({
  cascadeTex: { texture: d.texture2dArray(d.f32) },
  cascadeSampler: { sampler: 'filtering' },
});

const overlayFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const field = std.textureSample(radianceFieldView.$, radianceSampler.$, uv)
    .xyz;
  const baseColor = ACESFilm(std.saturate(field));

  if (overlayEnabledUniform.$ === d.u32(0)) {
    return d.vec4f(baseColor, 1);
  }

  const debugLayer = overlayDebugCascadeUniform.$;
  const cascadeProbes = cascadeProbesUniform.$;
  const probes = d.vec2u(
    std.max(cascadeProbes.x >> debugLayer, d.u32(1)),
    std.max(cascadeProbes.y >> debugLayer, d.u32(1)),
  );

  // Ray dimensions: 2x2 stored at layer 0, doubling each layer
  const raysDimStored = d.u32(2) << debugLayer;
  const raysDimActual = raysDimStored * d.u32(2);
  const rayCountActual = raysDimActual * raysDimActual;

  // Interval for ray visualization
  const cascadeProbesMinVal = d.f32(std.min(cascadeProbes.x, cascadeProbes.y));
  const interval0 = 1 / cascadeProbesMinVal;
  const pow4 = d.f32(d.u32(1) << (debugLayer * d.u32(2)));
  const endUv = (interval0 * (pow4 - 1)) / 3 + interval0 * pow4;

  // Visual parameters
  const probeSpacing = std.min(1 / d.f32(probes.x), 1 / d.f32(probes.y));
  const probeRadius = std.max(probeSpacing * 0.08, 0.002);
  const rayThickness = std.max(probeSpacing * 0.03, 0.001);

  let minProbeDist = d.f32(1000);
  let minRayDist = d.f32(1000);
  let closestRayColor = d.vec3f();

  const centerProbe = d.vec2i(std.floor(uv.mul(d.vec2f(probes))));

  // Check nearby probes (3x3 grid)
  for (let py = -1; py <= 1; py++) {
    for (let px = -1; px <= 1; px++) {
      const probeXY = centerProbe.add(d.vec2i(px, py));
      if (
        probeXY.x < 0 ||
        probeXY.x >= d.i32(probes.x) ||
        probeXY.y < 0 ||
        probeXY.y >= d.i32(probes.y)
      ) {
        continue;
      }

      const probe = d.vec2u(probeXY);
      const probePos = d.vec2f(probe).add(0.5).div(d.vec2f(probes));
      minProbeDist = std.min(
        minProbeDist,
        sdf.sdDisk(uv.sub(probePos), probeRadius),
      );

      if (std.length(uv.sub(probePos)) > probeSpacing * 0.7) {
        continue;
      }

      const rayStep = std.max(1, d.u32(rayCountActual / 24));
      let ri = d.u32(0);
      while (ri < rayCountActual) {
        const rayIndex = d.f32(ri) + 0.5;
        const angle = (rayIndex / rayCountActual) * (Math.PI * 2) -
          Math.PI;
        const rayDir = d.vec2f(std.cos(angle), -std.sin(angle));
        const rayDist = sdf.sdLine(
          uv,
          probePos,
          probePos.add(rayDir.mul(std.max(endUv, 0.01))),
        );

        if (rayDist < minRayDist) {
          const dirStored = d.vec2u(
            (ri % raysDimActual) >> d.u32(1),
            d.u32(ri / raysDimActual) >> d.u32(1),
          );
          const sample = std.textureLoad(
            overlayDebugBGL.$.cascadeTex,
            d.vec2i(atlasPos(dirStored, probe, probes)),
            debugLayer,
            0,
          );
          minRayDist = rayDist;
          closestRayColor = sample.xyz;
        }
        ri = ri + rayStep;
      }
    }
  }

  // Visualize rays
  let overlayColor = d.vec3f();
  let overlayAlpha = d.f32(0);
  if (minRayDist < rayThickness) {
    overlayColor = ACESFilm(std.saturate(closestRayColor));
    overlayAlpha =
      std.smoothstep(rayThickness * 1.5, rayThickness * 0.3, minRayDist) * 0.8;
  }

  // Probe outline
  if (std.abs(minProbeDist) < probeRadius * 0.2) {
    const edgeAlpha = std.smoothstep(
      probeRadius * 0.3,
      probeRadius * 0.1,
      std.abs(minProbeDist),
    ) * 0.3;
    overlayColor = std.mix(overlayColor, d.vec3f(1.0, 1.0, 0.0), edgeAlpha);
    overlayAlpha = std.max(overlayAlpha, edgeAlpha);
  }

  return d.vec4f(std.mix(baseColor, overlayColor, overlayAlpha), 1.0);
});

const cascadePassPipeline = root['~unstable']
  .with(sceneDataAccess, sceneDataUniform)
  .withCompute(cascadePassCompute)
  .createPipeline();

const cascadePassBindGroups = Array.from(
  { length: cascadeAmount },
  (_, layer) => {
    const writeToA = (cascadeAmount - 1 - layer) % 2 === 0;
    const dstTexture = cascadeTextures[writeToA ? 0 : 1];
    const srcTexture = cascadeTextures[writeToA ? 1 : 0];

    return root.createBindGroup(cascadePassBGL, {
      upper: srcTexture.createView(d.texture2d(d.f32), {
        baseArrayLayer: Math.min(layer + 1, cascadeAmount - 1),
        arrayLayerCount: 1,
      }),
      upperSampler: cascadeSampler,
      dst: dstTexture.createView(
        d.textureStorage2d('rgba16float', 'write-only'),
        { baseArrayLayer: layer, arrayLayerCount: 1 },
      ),
    });
  },
);

const buildRadianceFieldPipeline = root['~unstable']
  .withCompute(buildRadianceFieldCompute)
  .createPipeline();

const createBuildRadianceFieldBG = (textureIndex: number) =>
  root.createBindGroup(buildRadianceFieldBGL, {
    src: cascadeTextures[textureIndex].createView(d.texture2d(d.f32), {
      baseArrayLayer: 0,
      arrayLayerCount: 1,
    }),
    srcSampler: cascadeSampler,
    dst: radianceFieldStoreView,
  });

const buildRadianceFieldBindGroups = [
  createBuildRadianceFieldBG(0),
  createBuildRadianceFieldBG(1),
];

function buildRadianceField() {
  const cascade0InA = (cascadeAmount - 1) % 2 === 0;
  const buildRadianceFieldBG =
    buildRadianceFieldBindGroups[cascade0InA ? 0 : 1];

  buildRadianceFieldPipeline
    .with(buildRadianceFieldBG)
    .dispatchWorkgroups(
      Math.ceil(outputProbesX / 8),
      Math.ceil(outputProbesY / 8),
    );
}

function runCascadesTopDown() {
  for (let layer = cascadeAmount - 1; layer >= 0; layer--) {
    const probesX = cascadeProbesX >> layer;
    const probesY = cascadeProbesY >> layer;

    cascadeIndexUniform.write(layer);
    probesUniform.write(d.vec2u(probesX, probesY));

    cascadePassPipeline
      .with(cascadePassBindGroups[layer])
      .dispatchWorkgroups(
        Math.ceil(cascadeDimX / 8),
        Math.ceil(cascadeDimY / 8),
      );
  }
}

function updateLighting() {
  runCascadesTopDown();
  buildRadianceField();
}
updateLighting();

const createOverlayDebugBG = (textureIndex: number) =>
  root.createBindGroup(overlayDebugBGL, {
    cascadeTex: cascadeTextures[textureIndex].createView(
      d.texture2dArray(d.f32),
    ),
    cascadeSampler: cascadeSampler,
  });

const overlayDebugBindGroups = [
  createOverlayDebugBG(0),
  createOverlayDebugBG(1),
];

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(overlayFrag, { format: presentationFormat })
  .createPipeline();

let frameId: number;
let debugLayer = 0;

async function frame() {
  const writeToA = (cascadeAmount - 1 - debugLayer) % 2 === 0;
  const overlayDebugBG = overlayDebugBindGroups[writeToA ? 0 : 1];

  renderPipeline
    .with(overlayDebugBG)
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
  frameId = requestAnimationFrame(frame);
}
frameId = requestAnimationFrame(frame);

function updateUniforms() {
  sceneDataUniform.write(sceneData);
}

const dragController = new DragController(
  canvas,
  (id, position) => {
    updateElementPosition(id, position);
    updateUniforms();
    updateLighting();
  },
  (id, position) => {
    updateElementPosition(id, position);
    updateUniforms();
    updateLighting();
  },
);

export function onCleanup() {
  dragController.destroy();
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}

export const controls = {
  'Show Overlay': {
    initial: false,
    onToggleChange: (value: boolean) => {
      overlayEnabledUniform.write(value ? 1 : 0);
    },
  },
  'Cascade Layer': {
    initial: 0,
    min: 0,
    max: cascadeAmount - 1,
    step: 1,
    onSliderChange: (value: number) => {
      overlayDebugCascadeUniform.write(value);
      debugLayer = value;
    },
  },
};
