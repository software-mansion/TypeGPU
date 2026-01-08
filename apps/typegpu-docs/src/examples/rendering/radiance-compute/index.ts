import tgpu from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  SceneData,
  sceneData,
  sceneDataAccess,
  sceneSDF,
  updateElementPosition,
} from './scene.ts';
import { DragController } from './drag-controller.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

const dim = 1024;
const baseRaysDimStored = 2; // Pre-averaged: 2x2 stored texels = 4x4 effective rays per probe

let baseProbesX: number;
let baseProbesY: number;

const canvasAspect = canvas.width / canvas.height;
if (canvasAspect >= 1.0) {
  baseProbesY = dim / baseRaysDimStored;
  baseProbesX = Math.round(baseProbesY * canvasAspect);
} else {
  baseProbesX = dim / baseRaysDimStored;
  baseProbesY = Math.round(baseProbesX / canvasAspect);
}

const dimX = baseProbesX * baseRaysDimStored;
const dimY = baseProbesY * baseRaysDimStored;
const cascadeAmount = Math.round(Math.log2(Math.min(baseProbesX, baseProbesY)));

const cascadesTextureA = root['~unstable']
  .createTexture({
    size: [dimX, dimY, cascadeAmount],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const cascadesTextureB = root['~unstable']
  .createTexture({
    size: [dimX, dimY, cascadeAmount],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const radianceFieldTex = root['~unstable']
  .createTexture({
    size: [baseProbesX, baseProbesY],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const radianceFieldView = radianceFieldTex.createView(d.texture2d());

const radianceFieldStoreView = radianceFieldTex.createView(
  d.textureStorage2d('rgba16float', 'write-only'),
);

const buildRadianceFieldBGL = tgpu.bindGroupLayout({
  src: { storageTexture: d.textureStorage2d('rgba16float', 'read-only') },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const radianceSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const sceneDataUniform = root.createUniform(SceneData, sceneData);

const cascadeIndexUniform = root.createUniform(d.u32);
const probesUniform = root.createUniform(d.vec2u);
const dimUniform = root.createUniform(d.vec2u, d.vec2u(dimX, dimY));
const baseProbesUniform = root.createUniform(
  d.vec2u,
  d.vec2u(baseProbesX, baseProbesY),
);

const AtlasLocal = d.struct({
  dir: d.vec2u,
  probe: d.vec2u,
});

const atlasToDirFirst = (gid: d.v2u, probes: d.v2u) => {
  'use gpu';
  return AtlasLocal({
    dir: gid.div(probes),
    probe: std.mod(gid, probes),
  });
};

const dirFirstAtlasPos = (dir: d.v2u, probe: d.v2u, probes: d.v2u) => {
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
  const dim2 = dimUniform.$;
  if (gid.x >= dim2.x || gid.y >= dim2.y) {
    return;
  }

  const layer = cascadeIndexUniform.$;
  const probes = probesUniform.$;
  const topLayer = d.u32(cascadeAmount - 1);

  // Decode atlas position to (direction, probe)
  const lp = atlasToDirFirst(gid.xy, probes);
  const dirStored = lp.dir;
  const probe = lp.probe;

  // Stored vs Actual ray dimensions:
  // Each stored texel represents a 2x2 block of actual rays (pre-averaged)
  const raysDimStoredX = d.u32(dim2.x / probes.x);
  const raysDimStoredY = d.u32(dim2.y / probes.y);
  const raysDimStored = std.min(raysDimStoredX, raysDimStoredY);
  const raysDimActual = raysDimStored << d.u32(1); // 2x for cascade hierarchy
  const rayCountActual = raysDimActual * raysDimActual;

  const probePos = d.vec2f(probe).add(0.5).div(d.vec2f(probes));

  // Interval calculation
  const baseProbes2 = baseProbesUniform.$;
  const baseProbesMin = d.f32(std.min(baseProbes2.x, baseProbes2.y));
  const interval0Uv = 1.0 / baseProbesMin;
  const pow4 = d.f32(d.u32(1) << (layer * d.u32(2)));
  const startUv = interval0Uv * (pow4 - 1.0) / 3.0;
  const endUv = startUv + interval0Uv * pow4;

  const eps = 0.5 / baseProbesMin;
  const minStep = 0.25 / baseProbesMin;

  let accum = d.vec4f();

  // Cast 4 rays per stored texel (2x2 block) and average them
  for (let i = 0; i < 4; i++) {
    const ox = d.u32(d.u32(i) & d.u32(1));
    const oy = d.u32(d.u32(i) >> d.u32(1));

    // Map stored direction to actual direction (2x2 block)
    const dirActual2D = dirStored.mul(d.u32(2)).add(d.vec2u(ox, oy));

    // Compute ray direction from actual ray index
    const rayIndex = d.f32(dirActual2D.y * raysDimActual + dirActual2D.x) + 0.5;
    const angle = (rayIndex / d.f32(rayCountActual)) * (Math.PI * 2) - Math.PI;
    const rayDir = d.vec2f(std.cos(angle), -std.sin(angle));

    // Raymarch
    let rgb = d.vec3f();
    let T = d.f32(1);
    let t = startUv;

    for (let step = 0; step < 32; step++) {
      if (t > endUv) break;
      const p = probePos.add(rayDir.mul(t));
      const hit = sceneSDF(p);

      if (hit.dist <= eps) {
        rgb = d.vec3f(hit.color);
        T = d.f32(0);
        break;
      }
      t += std.max(hit.dist, minStep);
    }

    // Merge with upper cascade
    if (layer < topLayer && T > 0.01) {
      const probesU = d.vec2u(
        std.max(probes.x >> d.u32(1), d.u32(1)),
        std.max(probes.y >> d.u32(1), d.u32(1)),
      );

      // Upper cascade's stored resolution matches our actual resolution
      const tileOriginU = d.vec2f(
        d.f32(dirActual2D.x * probesU.x),
        d.f32(dirActual2D.y * probesU.y),
      );

      // Map probe position to pixel coordinates within the tile
      const probePixelU = probePos.mul(d.vec2f(probesU));

      // Clamp to prevent bilinear bleeding into neighboring direction tiles
      const clampedPixelU = std.clamp(
        probePixelU,
        d.vec2f(0.5),
        d.vec2f(probesU).sub(0.5),
      );

      // Convert to UV space
      const uvU = tileOriginU.add(clampedPixelU).div(d.vec2f(dim2));

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

  // Store average of 4 rays
  const outVal = accum.mul(0.25);
  std.textureStore(cascadePassBGL.$.dst, gid.xy, outVal);
});

const buildRadianceFieldCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const baseProbes2 = baseProbesUniform.$;
  if (gid.x >= baseProbes2.x || gid.y >= baseProbes2.y) {
    return;
  }

  const dim2 = dimUniform.$;
  const probes = baseProbes2;
  const raysDimStoredX = d.u32(dim2.x / probes.x);
  const raysDimStoredY = d.u32(dim2.y / probes.y);
  const raysDimStored = std.min(raysDimStoredX, raysDimStoredY); // Should be 2 for cascade0
  const probe = gid.xy;
  const rayCountStored = raysDimStored * raysDimStored;

  let sum = d.vec3f();
  let idx = d.u32(0);
  while (idx < rayCountStored) {
    // Direction-first layout: iterate over directions (row-major)
    const dir = d.vec2u(idx % raysDimStored, idx / raysDimStored);
    const atlasPx = dirFirstAtlasPos(dir, probe, probes);
    const ray = std.textureLoad(buildRadianceFieldBGL.$.src, atlasPx);
    sum = sum.add(ray.xyz);
    idx += 1;
  }

  const avg = sum.div(d.f32(rayCountStored));
  std.textureStore(buildRadianceFieldBGL.$.dst, probe, d.vec4f(avg, 1.0));
});

const ACESFilm = tgpu.fn([d.vec3f], d.vec3f)((x) => {
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
  const field = std.textureSample(radianceFieldView.$, radianceSampler.$, uv)
    .xyz;
  const outRgb = std.saturate(field);
  return d.vec4f(ACESFilm(outRgb), 1.0);
});

const cascadePassPipeline = root['~unstable']
  .with(sceneDataAccess, sceneDataUniform)
  .withCompute(cascadePassCompute)
  .createPipeline();

const cascadePassBindGroups = Array.from(
  { length: cascadeAmount },
  (_, layer) => {
    const writeToA = (cascadeAmount - 1 - layer) % 2 === 0;
    const dstTexture = writeToA ? cascadesTextureA : cascadesTextureB;
    const srcTexture = writeToA ? cascadesTextureB : cascadesTextureA;

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

// Pre-create bind groups for both possible cascade 0 locations (ping-pong result)
const buildRadianceFieldBG_A = root.createBindGroup(buildRadianceFieldBGL, {
  src: cascadesTextureA.createView(
    d.textureStorage2d('rgba16float', 'read-only'),
    { baseArrayLayer: 0, arrayLayerCount: 1 },
  ),
  dst: radianceFieldStoreView,
});

const buildRadianceFieldBG_B = root.createBindGroup(buildRadianceFieldBGL, {
  src: cascadesTextureB.createView(
    d.textureStorage2d('rgba16float', 'read-only'),
    { baseArrayLayer: 0, arrayLayerCount: 1 },
  ),
  dst: radianceFieldStoreView,
});

function buildRadianceField() {
  // Determine which texture has cascade 0 after ping-pong
  const cascade0InA = (cascadeAmount - 1) % 2 === 0;
  const buildRadianceFieldBG = cascade0InA
    ? buildRadianceFieldBG_A
    : buildRadianceFieldBG_B;

  buildRadianceFieldPipeline
    .with(buildRadianceFieldBG)
    .dispatchWorkgroups(
      Math.ceil(baseProbesX / 8),
      Math.ceil(baseProbesY / 8),
    );
}

// Top-down cascade dispatch (replaces separate raymarch + merge)
function runCascadesTopDown() {
  // Process from highest cascade down to 0
  // Each layer reads from layer+1 (already computed) and writes to itself
  for (let layer = cascadeAmount - 1; layer >= 0; layer--) {
    const probesX = baseProbesX >> layer;
    const probesY = baseProbesY >> layer;

    cascadeIndexUniform.write(layer);
    probesUniform.write(d.vec2u(probesX, probesY));

    cascadePassPipeline
      .with(cascadePassBindGroups[layer])
      .dispatchWorkgroups(Math.ceil(dimX / 8), Math.ceil(dimY / 8));
  }
}

function updateLighting() {
  runCascadesTopDown(); // Fused raymarch + merge
  buildRadianceField(); // Build final radiance field from cascade 0
}
updateLighting();

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(finalRadianceFieldFrag, { format: presentationFormat })
  .createPipeline();

let isRunning = true;
let frameId: number;

function frame() {
  if (!isRunning) return; // Prevent using destroyed device

  renderPipeline
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

// Set up drag controller for interactive scene manipulation
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
  isRunning = false; // Stop the loop logic immediately
  dragController.destroy();
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}
