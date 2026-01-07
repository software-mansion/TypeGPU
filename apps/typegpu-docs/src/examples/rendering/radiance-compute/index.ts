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

const dim = 2048;
const baseProbes = dim / 4;
const baseRaysDim = dim / baseProbes;
const cascadeAmount = Math.log2(baseProbes);

const cascadesTexture = root['~unstable']
  .createTexture({
    size: [dim, dim, cascadeAmount],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const mergedTexture = root['~unstable']
  .createTexture({
    size: [dim, dim, cascadeAmount - 1],
    format: 'rgba16float',
  })
  .$usage('storage', 'sampled');

const mergeSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
});

const mergeBindGroupLayout = tgpu.bindGroupLayout({
  t1: { storageTexture: d.textureStorage2d('rgba16float', 'read-only') },
  t2: { texture: d.texture2d(d.f32) },
  t2Sampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const mergeBindGroups = Array.from(
  { length: cascadeAmount - 1 },
  (_, n) => {
    const layer = cascadeAmount - 2 - n;

    return root.createBindGroup(mergeBindGroupLayout, {
      t1: cascadesTexture.createView(
        d.textureStorage2d('rgba16float', 'read-only'),
        { baseArrayLayer: layer, arrayLayerCount: 1 },
      ),
      t2: (layer === cascadeAmount - 2 ? cascadesTexture : mergedTexture)
        .createView(
          d.texture2d(d.f32),
          { baseArrayLayer: layer + 1, arrayLayerCount: 1 },
        ),
      t2Sampler: mergeSampler,
      dst: mergedTexture.createView(
        d.textureStorage2d('rgba16float', 'write-only'),
        { baseArrayLayer: layer, arrayLayerCount: 1 },
      ),
    });
  },
);

const writeView = cascadesTexture.createView(
  d.textureStorage2dArray('rgba16float', 'write-only'),
);

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

const mergedCascade0RO = mergedTexture.createView(
  d.textureStorage2d('rgba16float', 'read-only'),
  { baseArrayLayer: 0, arrayLayerCount: 1 },
);

const buildRadianceFieldBGL = tgpu.bindGroupLayout({
  src: { storageTexture: d.textureStorage2d('rgba16float', 'read-only') },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

const buildRadianceFieldBG = root.createBindGroup(buildRadianceFieldBGL, {
  src: mergedCascade0RO,
  dst: radianceFieldStoreView,
});

const radianceSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const mousePosUniform = root.createUniform(d.vec2f);
const lightPosUniform = root.createUniform(d.vec2f, d.vec2f(0.5));
const mergeRaysDimUniform = root.createUniform(d.u32, baseRaysDim);
const lightColorUniform = root.createUniform(d.vec4f, d.vec4f(1));

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

const zOrderToLinear = tgpu.fn([d.vec2u], d.u32)((pos) => {
  return mortonEncode2D(pos.x, pos.y);
});

const indexToDir = tgpu.fn([d.u32, d.u32], d.vec2f)((mortonIdx, rayCount) => {
  const rayIndex = d.f32(mortonIdx) + 0.5;
  const angle = (rayIndex / d.f32(rayCount)) * Math.PI * 2 - Math.PI;
  return d.vec2f(std.cos(angle), -std.sin(angle));
});

const LocalPos = d.struct({
  probeCoord: d.vec2u,
  local: d.vec2u,
});

const globalToLocal = (gid: d.v2u, raysDim: number) => {
  'use gpu';
  const probeCoord = d.vec2u(gid.x / raysDim, gid.y / raysDim);
  const local = d.vec2u(gid.x % raysDim, gid.y % raysDim);
  return LocalPos({ probeCoord, local });
};

const getAtlasPos = (probeCoord: d.v2u, localRay: d.v2u, raysDim: number) => {
  'use gpu';
  return probeCoord.mul(d.u32(raysDim)).add(localRay);
};

const sampleProbeQuadFiltered = (
  probeCoord: d.v2u,
  childBase: number,
  uDim: number,
) => {
  'use gpu';
  const baseLocal = linearToZOrder(d.u32(childBase));
  // Compute center UV for the 2x2 quad
  // The quad spans from baseLocal to baseLocal+(1,1), so center is baseLocal+(0.5,0.5)
  const atlasBase = d.vec2f(probeCoord.mul(d.u32(uDim))).add(
    d.vec2f(baseLocal),
  );
  const centerUv = atlasBase.add(d.vec2f(1)).div(d.f32(dim));

  return std.textureSampleLevel(
    mergeBindGroupLayout.$.t2,
    mergeBindGroupLayout.$.t2Sampler,
    centerUv,
    0,
  );
};

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

const buildRadianceFieldCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  if (gid.x >= baseProbes || gid.y >= baseProbes) {
    return;
  }

  const raysDim = d.u32(baseRaysDim);
  const probe = gid.xy;
  const rayCount = raysDim * raysDim;

  let sum = d.vec3f();
  let idx = d.u32(0);
  while (idx < rayCount) {
    const localRay = linearToZOrder(idx);
    const atlasPx = getAtlasPos(probe, localRay, baseRaysDim);
    const ray = std.textureLoad(buildRadianceFieldBGL.$.src, atlasPx);
    sum = sum.add(ray.xyz);
    idx += 1;
  }

  const avg = sum.div(d.f32(rayCount));
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

const rayMarchCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  if (gid.x >= dim || gid.y >= dim) {
    return;
  }

  const interval0Px = d.f32(baseRaysDim);
  let probes = d.u32(baseProbes);
  let textureIndex = d.u32(0);

  while (probes > 1) {
    const raysDim = d.u32(dim) / probes;
    const raysDimU = d.u32(raysDim);
    const lp = globalToLocal(gid.xy, raysDimU);

    const mortonIdx = zOrderToLinear(lp.local);
    const rayCount = raysDimU * raysDimU;
    const dir = indexToDir(mortonIdx, rayCount);

    const probePos = d.vec2f(lp.probeCoord).add(0.5).div(d.f32(probes));

    // 4^i = 2^(2i) = 1 << (2*i)
    const pow4 = d.f32(d.u32(1) << (textureIndex * d.u32(2)));

    const startPx = interval0Px * (pow4 - 1) / 3;
    const lengthPx = interval0Px * pow4;
    const startUv = startPx / d.f32(dim);
    const endUv = (startPx + lengthPx) / d.f32(dim);

    let rgb = d.vec3f();
    let T = d.f32(1);
    let t = startUv;

    const eps = 0.5 / dim;
    const minStep = 0.25 / dim;

    for (let step = 0; step < 32; step++) {
      if (t > endUv) {
        break;
      }

      const p = probePos.add(dir.mul(t));
      const occluderDist = sceneSDF(p);

      if (occluderDist.dist <= eps) {
        rgb = d.vec3f(occluderDist.color);
        T = d.f32(0);
        break;
      }

      t += std.max(occluderDist.dist, minStep);
    }

    std.textureStore(writeView.$, gid.xy, textureIndex, d.vec4f(rgb, T));

    probes = probes >> 1;
    textureIndex += 1;
  }
});

const mergeCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  if (gid.x >= dim || gid.y >= dim) {
    return;
  }

  const nDim = mergeRaysDimUniform.$;
  const uDim = nDim << 1;

  const rayN = std.textureLoad(mergeBindGroupLayout.$.t1, gid.xy);
  if (rayN.w <= 0.01) {
    std.textureStore(mergeBindGroupLayout.$.dst, gid.xy, rayN);
    return;
  }

  const localPosN = globalToLocal(gid.xy, nDim);

  const probesN = d.u32(dim) / nDim;
  const probesU = d.u32(probesN) >> 1;

  const maxProbeIdx = std.max(probesU, 1) - 1;
  const maxProbeIdxF = d.f32(maxProbeIdx);

  const p = d.vec2f(localPosN.probeCoord);
  const u = p.sub(d.vec2f(0.5)).mul(d.vec2f(0.5));

  const u0f = std.clamp(std.floor(u), d.vec2f(), d.vec2f(maxProbeIdxF));
  const u1f = std.min(u0f.add(d.vec2f(1)), d.vec2f(maxProbeIdxF));
  const f = std.clamp(u.sub(u0f), d.vec2f(), d.vec2f(1));

  const u0 = d.vec2u(u0f);
  const u1 = d.vec2u(u1f);

  const angN = zOrderToLinear(localPosN.local);
  const childBase = angN * d.u32(4);

  const probeTL = d.vec2u(u0.x, u0.y);
  const probeTR = d.vec2u(u1.x, u0.y);
  const probeBL = d.vec2u(u0.x, u1.y);
  const probeBR = d.vec2u(u1.x, u1.y);

  const TL = sampleProbeQuadFiltered(probeTL, childBase, uDim);
  const TR = sampleProbeQuadFiltered(probeTR, childBase, uDim);
  const BL = sampleProbeQuadFiltered(probeBL, childBase, uDim);
  const BR = sampleProbeQuadFiltered(probeBR, childBase, uDim);

  const upper = std.mix(
    std.mix(TL, TR, f.x),
    std.mix(BL, BR, f.x),
    f.y,
  );

  const outRgb = rayN.xyz.add(upper.xyz.mul(rayN.w));
  const outT = rayN.w * upper.w;
  std.textureStore(mergeBindGroupLayout.$.dst, gid.xy, d.vec4f(outRgb, outT));
});

const rayMarchPipeline = root['~unstable']
  .withCompute(rayMarchCompute)
  .createPipeline();

const mergePipeline = root['~unstable']
  .withCompute(mergeCompute)
  .createPipeline();

const buildRadianceFieldPipeline = root['~unstable']
  .withCompute(buildRadianceFieldCompute)
  .createPipeline();

function buildRadianceField() {
  buildRadianceFieldPipeline
    .with(buildRadianceFieldBG)
    .dispatchWorkgroups(
      Math.ceil(baseProbes / 8),
      Math.ceil(baseProbes / 8),
    );
}

function mergeAllCascades() {
  for (let n = 0; n < mergeBindGroups.length; n++) {
    const layer = cascadeAmount - 2 - n;
    const probes = baseProbes >> layer;
    const raysDim = dim / probes;

    mergeRaysDimUniform.write(raysDim);

    mergePipeline
      .with(mergeBindGroups[n])
      .dispatchWorkgroups(Math.ceil(dim / 8), Math.ceil(dim / 8));
  }
}

function updateLighting() {
  rayMarchPipeline.dispatchWorkgroups(Math.ceil(dim / 8), Math.ceil(dim / 8));
  mergeAllCascades();
  buildRadianceField();
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
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  mousePosUniform.write(d.vec2f(x, y));

  if (event.buttons === 1) {
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
