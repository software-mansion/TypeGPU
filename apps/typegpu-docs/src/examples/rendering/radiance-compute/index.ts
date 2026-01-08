import tgpu from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
});

// Primary setting: texture dimension for cascade storage
const dim = 1024;
const baseRaysDimStored = 2; // Pre-averaged: 2x2 stored texels = 4x4 effective rays per probe
const baseProbes = dim / baseRaysDimStored; // Derived: 512 probes at finest cascade
const cascadeAmount = Math.round(Math.log2(baseProbes));

const cascadesTextureA = root['~unstable']
  .createTexture({
    size: [dim, dim, cascadeAmount],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const cascadesTextureB = root['~unstable']
  .createTexture({
    size: [dim, dim, cascadeAmount],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const radianceFieldTex = root['~unstable']
  .createTexture({
    size: [baseProbes, baseProbes],
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

const lightPosUniform = root.createUniform(d.vec2f, d.vec2f(0.5));
const lightColorUniform = root.createUniform(d.vec4f, d.vec4f(1));

// Uniforms for the fused cascade pass
const cascadeIndexUniform = root.createUniform(d.u32);
const probesUniform = root.createUniform(d.u32);

// Z-order curve (Morton code) encoding/decoding for better cache efficiency
const spreadBits = tgpu.fn([d.u32], d.u32)((v) => {
  let x = v;
  x = (x | (x << 8)) & 0x00ff00ff;
  x = (x | (x << 4)) & 0x0f0f0f0f;
  x = (x | (x << 2)) & 0x33333333;
  x = (x | (x << 1)) & 0x55555555;
  return x;
});

const compactBits = tgpu.fn([d.u32], d.u32)((v) => {
  let x = v & 0x55555555;
  x = (x | (x >> 1)) & 0x33333333;
  x = (x | (x >> 2)) & 0x0f0f0f0f;
  x = (x | (x >> 4)) & 0x00ff00ff;
  x = (x | (x >> 8)) & 0x0000ffff;
  return x;
});

const mortonEncode2D = tgpu.fn([d.u32, d.u32], d.u32)((x, y) => {
  return spreadBits(x) | (spreadBits(y) << 1);
});

const mortonDecode2D = tgpu.fn([d.u32], d.vec2u)((code) => {
  return d.vec2u(compactBits(code), compactBits(code >> 1));
});

const linearToZOrder = tgpu.fn([d.u32], d.vec2u)((idx) => {
  return mortonDecode2D(idx);
});

// Direction-first layout helpers (key optimization for hardware filtering)
const AtlasLocal = d.struct({
  dir: d.vec2u,
  probe: d.vec2u,
});

const atlasToDirFirst = tgpu.fn([d.vec2u, d.u32], AtlasLocal)((gid, probes) => {
  const dir = d.vec2u(gid.x / probes, gid.y / probes);
  const probe = d.vec2u(gid.x % probes, gid.y % probes);
  return AtlasLocal({ dir, probe });
});

const dirFirstAtlasPos = tgpu.fn([d.vec2u, d.vec2u, d.u32], d.vec2u)(
  (dir, probe, probes) => {
    return dir.mul(probes).add(probe);
  },
);

const SceneResult = d.struct({
  dist: d.f32,
  color: d.vec3f,
});

const sceneSDF = (p: d.v2f) => {
  'use gpu';
  const occluder1 = sdf.sdBox2d(p.sub(d.vec2f(0.3, 0.3)), d.vec2f(0.08, 0.15));
  const occluder2 = sdf.sdBox2d(p.sub(d.vec2f(0.7, 0.6)), d.vec2f(0.12, 0.08));
  const occluder3 = sdf.sdDisk(p.sub(d.vec2f(0.5, 0.75)), d.f32(0.1));
  const minOccluder = std.min(occluder1, occluder2, occluder3);
  const light = sdf.sdDisk(p.sub(lightPosUniform.$), d.f32(0.05));

  if (light < minOccluder && minOccluder > 0) {
    return SceneResult({ dist: light, color: lightColorUniform.$.xyz });
  }
  return SceneResult({ dist: minOccluder, color: d.vec3f(0) });
};

// Fused cascade pass: raymarch + merge in one top-down pass per layer
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
  if (gid.x >= dim || gid.y >= dim) return;

  const layer = cascadeIndexUniform.$;
  const probes = probesUniform.$;
  const topLayer = d.u32(cascadeAmount - 1);

  // Direction-first layout: decode gid to (dir, probe)
  const lp = atlasToDirFirst(gid.xy, probes);
  const dirStored = lp.dir;
  const probe = lp.probe;

  // Stored raysDim at this layer
  const raysDimStored = d.u32(d.u32(dim) / probes);
  // Actual direction grid is 2x (because we pre-average 4 rays per stored texel)
  const raysDimActual = raysDimStored << d.u32(1);
  const rayCountActual = raysDimActual * raysDimActual;

  const probePos = d.vec2f(probe).add(0.5).div(d.f32(probes));

  // Interval calculation (decoupled from dim for consistent lighting)
  const interval0Uv = 1.0 / d.f32(baseProbes);
  const pow4 = d.f32(d.u32(1) << (layer * d.u32(2)));
  const startUv = interval0Uv * (pow4 - 1.0) / 3.0;
  const endUv = startUv + interval0Uv * pow4;

  // March tuning
  const eps = 0.5 / d.f32(baseProbes);
  const minStep = 0.25 / d.f32(baseProbes);

  let accum = d.vec4f();

  // Cast 4 rays per stored texel (2x2 block in actual direction grid)
  for (let i = 0; i < 4; i++) {
    const ox = d.u32(d.u32(i) & d.u32(1));
    const oy = d.u32(d.u32(i) >> d.u32(1));

    // Map stored direction to actual direction (2x finer)
    const dirActual2D = dirStored.mul(d.u32(2)).add(d.vec2u(ox, oy));
    const mortonIdx = mortonEncode2D(dirActual2D.x, dirActual2D.y);

    const rayIndex = d.f32(mortonIdx) + 0.5;
    const angle = (rayIndex / d.f32(rayCountActual)) * (Math.PI * 2) - Math.PI;
    const dir = d.vec2f(std.cos(angle), -std.sin(angle));

    // Raymarch
    let rgb = d.vec3f();
    let T = d.f32(1);
    let t = startUv;

    for (let step = 0; step < 32; step++) {
      if (t > endUv) break;

      const p = probePos.add(dir.mul(t));
      const hit = sceneSDF(p);

      if (hit.dist <= eps) {
        rgb = d.vec3f(hit.color);
        T = d.f32(0);
        break;
      }

      t += std.max(hit.dist, minStep);
    }

    // Merge with upper cascade (hardware bilinear interpolation!)
    if (layer < topLayer && T > 0.01) {
      const probesU = std.max(probes >> d.u32(1), d.u32(1));

      // Fractional probe position in upper grid
      // Upper grid has half the probes, so we map probe/2 + 0.25 for center alignment
      let probeUf = d.vec2f(probe).mul(0.5).add(d.vec2f(0.25));

      // Clamp away from block edges to prevent filtering into neighboring direction blocks
      if (probesU > d.u32(2)) {
        const lo = d.vec2f(1.5);
        const hi = d.vec2f(d.f32(probesU) - 1.5);
        probeUf = std.clamp(probeUf, lo, hi);
      }

      // Upper cascade uses direction-first too, and its stored raysDim == our actual raysDim
      // So we can sample upper using dirActual2D directly
      const atlasBaseU = d.vec2f(dirActual2D.mul(probesU));
      const atlasPxU = atlasBaseU.add(probeUf);

      const uvU = atlasPxU.div(d.f32(dim));

      // Single bilinear sample across 4 probes (key optimization!)
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
  if (gid.x >= baseProbes || gid.y >= baseProbes) {
    return;
  }

  const probes = d.u32(baseProbes);
  const raysDimStored = d.u32(d.u32(dim) / probes); // Should be 2 for cascade0
  const probe = gid.xy;
  const rayCountStored = raysDimStored * raysDimStored;

  let sum = d.vec3f();
  let idx = d.u32(0);
  while (idx < rayCountStored) {
    // Direction-first layout: iterate over directions
    const dir = linearToZOrder(idx);
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
    .dispatchWorkgroups(Math.ceil(baseProbes / 8), Math.ceil(baseProbes / 8));
}

// Top-down cascade dispatch (replaces separate raymarch + merge)
function runCascadesTopDown() {
  // Process from highest cascade down to 0
  // Each layer reads from layer+1 (already computed) and writes to itself
  for (let layer = cascadeAmount - 1; layer >= 0; layer--) {
    const probes = baseProbes >> layer;

    cascadeIndexUniform.write(layer);
    probesUniform.write(probes);

    cascadePassPipeline
      .with(cascadePassBindGroups[layer])
      .dispatchWorkgroups(Math.ceil(dim / 8), Math.ceil(dim / 8));
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

let frameId: number;
function frame() {
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

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  lightPosUniform.write(d.vec2f(x, y));
  updateLighting();
});

canvas.addEventListener('mousemove', (event) => {
  if (event.buttons === 1) {
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    lightPosUniform.write(d.vec2f(x, y));
    updateLighting();
  }
});

export const controls = {
  'Light Color': {
    initial: [1, 1, 1],
    onColorChange: (c: [number, number, number]) => {
      lightColorUniform.write(d.vec4f(...c, 1));
      updateLighting();
    },
  },
};

export function onCleanup() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}
