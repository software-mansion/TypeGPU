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
  alphaMode: 'opaque',
});

const dim = 2048;
const cascadeAmount = Math.log2(dim / 8);
const baseProbes = dim / 4;
const baseRaysDim = dim / baseProbes;

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

const mergeBindGroupLayout = tgpu.bindGroupLayout({
  t1: { storageTexture: d.textureStorage2d('rgba16float', 'read-only') },
  t2: { storageTexture: d.textureStorage2d('rgba16float', 'read-only') },
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
          d.textureStorage2d('rgba16float', 'read-only'),
          { baseArrayLayer: layer + 1, arrayLayerCount: 1 },
        ),
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
const renderView = cascadesTexture.createView(d.texture2dArray());

const nearestSampler = root['~unstable'].createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
});

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

const indexUniform = root.createUniform(d.u32, 0);
const raysDimUniform = root.createUniform(d.f32, baseRaysDim);
const mousePosUniform = root.createUniform(d.vec2f);
const lightPosUniform = root.createUniform(d.vec2f, d.vec2f(0.5));
const mergeRaysDimUniform = root.createUniform(d.u32, baseRaysDim);
const lightColorUniform = root.createUniform(d.vec3f, d.vec3f(1));

const posToDir = (localPos: d.v2u, raysDim: number) => {
  'use gpu';
  const ix = d.f32(localPos.x);
  const iy = d.f32(localPos.y);
  const rd = d.f32(raysDim);

  const rayIndex = iy * rd + ix + 0.5;
  const rayCount = rd * rd;

  const angle = (rayIndex / rayCount) * Math.PI * 2 - Math.PI;
  return d.vec2f(std.cos(angle), -std.sin(angle));
};

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

const sampleProbeQuad = (origin: d.v2u, childBase: number, uDim: number) => {
  'use gpu';
  let sum = d.vec4f();
  for (let i = 0; i < 4; i++) {
    const childIdx = childBase + i;
    const childLocal = d.vec2u(childIdx % uDim, childIdx / uDim);
    const ray = std.textureLoad(
      mergeBindGroupLayout.$.t2,
      origin.add(childLocal),
    );
    sum = sum.add(ray);
  }
  return sum.mul(0.25);
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
    return SceneResult({ dist: light, color: lightColorUniform.$ });
  } else {
    return SceneResult({ dist: minOccluder, color: d.vec3f(0) });
  }
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

  let sum = d.vec3f();

  let y = d.u32(0);
  while (y < raysDim) {
    let x = d.u32(0);
    while (x < raysDim) {
      const atlasPx = probe.mul(raysDim).add(d.vec2u(x, y));
      const ray = std.textureLoad(buildRadianceFieldBGL.$.src, atlasPx);
      sum = sum.add(ray.xyz);
      x += 1;
    }
    y += 1;
  }

  const rayCount = d.f32(raysDim * raysDim);
  const avg = sum.div(rayCount);

  std.textureStore(buildRadianceFieldBGL.$.dst, probe, d.vec4f(avg, 1.0));
});

const finalRadianceFieldFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const field = std.textureSample(radianceFieldView.$, radianceSampler.$, uv)
    .xyz;
  const outRgb = std.saturate(field);
  return d.vec4f(outRgb, 1.0);
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
    const raysDim = d.u32(dim / probes);

    const lp = globalToLocal(gid.xy, raysDim);
    const dir = posToDir(lp.local, raysDim);

    const probePos = d.vec2f(lp.probeCoord).add(0.5).div(d.f32(probes));

    // Radiance interval shell for this cascade: [t_i, t_{i+1}]
    // t_i = L0 * (4^i - 1) / 3, length_i = L0 * 4^i
    const c = d.f32(textureIndex);
    const pow4 = std.pow(4, c);

    const startPx = interval0Px * (pow4 - 1) / 3;
    const lengthPx = interval0Px * pow4;
    const startUv = startPx / d.f32(dim);
    const endUv = (startPx + lengthPx) / d.f32(dim);

    let rgb = d.vec3f();
    let T = d.f32(1);

    let t = startUv;

    const eps = 0.5 / dim;
    const minStep = 0.25 / dim;
    let step = d.u32(0);
    const maxSteps = d.u32(32);

    while (step < maxSteps) {
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
      step += 1;
    }

    const cascadeIndex = textureIndex;
    std.textureStore(writeView.$, gid.xy, cascadeIndex, d.vec4f(rgb, T));

    probes /= 2;
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

  const probesN = d.u32(dim / nDim);
  const probesU = probesN >> 1;

  const maxProbeIdx = std.max(probesU, 1) - 1;
  const maxProbeIdxF = d.f32(maxProbeIdx);

  const p = d.vec2f(localPosN.probeCoord);
  const u = p.sub(d.vec2f(0.5)).mul(d.vec2f(0.5));

  const u0f = std.clamp(
    std.floor(u),
    d.vec2f(),
    d.vec2f(maxProbeIdxF),
  );

  const u1f = std.min(
    u0f.add(d.vec2f(1)),
    d.vec2f(maxProbeIdxF),
  );

  const f = std.clamp(
    u.sub(u0f),
    d.vec2f(),
    d.vec2f(1),
  );

  const u0 = d.vec2u(u0f);
  const u1 = d.vec2u(u1f);

  const angN = localPosN.local.y * nDim + localPosN.local.x;
  const childBase = angN * d.u32(4);

  const s = d.vec2u(uDim, uDim);

  const originTL = d.vec2u(u0.x, u0.y).mul(s);
  const originTR = d.vec2u(u1.x, u0.y).mul(s);
  const originBL = d.vec2u(u0.x, u1.y).mul(s);
  const originBR = d.vec2u(u1.x, u1.y).mul(s);

  const TL = sampleProbeQuad(originTL, childBase, uDim);
  const TR = sampleProbeQuad(originTR, childBase, uDim);
  const BL = sampleProbeQuad(originBL, childBase, uDim);
  const BR = sampleProbeQuad(originBR, childBase, uDim);

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
      lightColorUniform.write(d.vec3f(...c));
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
