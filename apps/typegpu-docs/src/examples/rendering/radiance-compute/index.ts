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
const baseProbes = dim / 8;
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
const lightPosUniform = root.createUniform(d.vec2f);
const pickerPosUniform = root.createUniform(d.vec2f);
const mergeRaysDimUniform = root.createUniform(d.u32, baseRaysDim);

let currentCascadeIndex = 0;
let lightPos = { x: 0.5, y: 0.5 };
let pickerPos = { x: 0.5, y: 0.5 };

lightPosUniform.write(d.vec2f(lightPos.x, lightPos.y));
pickerPosUniform.write(d.vec2f(pickerPos.x, pickerPos.y));

const dirToAngle = (dir: d.v2f) => {
  'use gpu';
  const angle = std.atan2(-dir.y, dir.x);
  const pi = d.f32(Math.PI);
  const tau = d.f32(Math.PI * 2);
  const t = (angle + pi) / tau;
  return t;
};

const posToDir = (localPos: d.v2u, raysDim: number) => {
  'use gpu';
  const ix = d.f32(localPos.x);
  const iy = d.f32(localPos.y);
  const rd = d.f32(raysDim);

  const rayIndex = iy * rd + ix + 0.5;
  const rayCount = rd * rd;

  const pi = d.f32(Math.PI);
  const tau = d.f32(Math.PI * 2);
  const angle = (rayIndex / rayCount) * tau - pi;
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

const sceneOccluderSDF = (p: d.v2f) => {
  'use gpu';
  const occluder1 = sdf.sdBox2d(p.sub(d.vec2f(0.3, 0.3)), d.vec2f(0.08, 0.15));
  const occluder2 = sdf.sdBox2d(p.sub(d.vec2f(0.7, 0.6)), d.vec2f(0.12, 0.08));
  const occluder3 = sdf.sdDisk(p.sub(d.vec2f(0.5, 0.75)), d.f32(0.1));
  return std.min(std.min(occluder1, occluder2), occluder3);
};

const debugFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const color = std.textureSample(
    renderView.$,
    nearestSampler.$,
    uv,
    indexUniform.$,
  );

  if (std.distance(lightPosUniform.$, uv) < 0.06) {
    return d.vec4f(1, 0, 0, 1);
  }
  if (std.distance(pickerPosUniform.$, uv) < 0.006) {
    return d.vec4f(0, 0, 1, 1);
  }

  const raysDim = raysDimUniform.$;

  const dir = std.normalize(mousePosUniform.$.sub(pickerPosUniform.$));
  const t = dirToAngle(dir);

  const raysPerProbe = raysDim * raysDim;
  let rayIndex = std.floor(t * raysPerProbe);
  rayIndex = std.min(rayIndex, raysPerProbe - 1);

  const iy = std.floor(rayIndex / raysDim);
  const ix = rayIndex - iy * raysDim;

  const cpPx = std.floor(pickerPosUniform.$.mul(dim));
  const probeOrigin = std.floor(cpPx.div(raysDim)).mul(raysDim);
  const highlightPx = probeOrigin.add(d.vec2f(ix, iy));

  const fragPx = std.floor(uv.mul(dim));

  if (fragPx.x === highlightPx.x && fragPx.y === highlightPx.y) {
    return d.vec4f(1, 1, 0, 1);
  }

  return color;
});

const buildRadianceFieldCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  if (gid.x >= baseProbes || gid.y >= baseProbes) {
    return;
  }

  const raysDim = d.u32(baseRaysDim);
  const probe = d.vec2u(gid.x, gid.y);

  let sum = d.vec3f(0.0);

  let y = d.u32(0);
  while (y < raysDim) {
    let x = d.u32(0);
    while (x < raysDim) {
      const atlasPx = probe.mul(raysDim).add(d.vec2u(x, y));
      const ray = std.textureLoad(buildRadianceFieldBGL.$.src, atlasPx);
      sum = sum.add(ray.xyz);
      x = x + d.u32(1);
    }
    y = y + d.u32(1);
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

  // Add emissive light disk
  const lightRadiusUv = 0.05;
  const aa = d.f32(0.75) / d.f32(dim);

  const lightDist = sdf.sdDisk(uv.sub(lightPosUniform.$), lightRadiusUv);
  const lightMask = d.f32(1.0) - std.smoothstep(d.f32(0.0), aa, lightDist);
  const light = d.vec3f(lightMask);

  // Draw occluders
  const occluderDist = sceneOccluderSDF(uv);
  const occluderMask = d.f32(1.0) -
    std.smoothstep(d.f32(0.0), aa, occluderDist);

  // Composite: radiance field + light, then occluders on top
  let outRgb = std.min(field.add(light), d.vec3f(1.0));
  outRgb = std.mix(outRgb, d.vec3f(0.0), occluderMask);

  return d.vec4f(outRgb, 1.0);
});

const rayMarchCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  if (gid.x >= dim || gid.y >= dim) {
    return;
  }

  const lightPos = lightPosUniform.$;
  const lightRadiusUv = 0.05;
  const lightColor = d.vec3f(1);

  const interval0Px = d.f32(baseRaysDim);

  let probes = d.u32(baseProbes);
  let textureIndex = d.u32(0);

  while (probes > 1) {
    const raysDim = d.u32(dim) / probes;

    const lp = globalToLocal(gid.xy, raysDim);
    const dir = posToDir(lp.local, raysDim);

    const probePos = d.vec2f(lp.probeCoord).add(0.5).div(d.f32(probes));

    // Radiance interval shell for this cascade: [t_i, t_{i+1}]
    // t_i = L0 * (4^i - 1) / 3, length_i = L0 * 4^i
    const c = d.f32(textureIndex);
    const pow4 = std.pow(d.f32(4.0), c);

    const startPx = interval0Px * (pow4 - d.f32(1.0)) / d.f32(3.0);
    const lengthPx = interval0Px * pow4;
    const startUv = startPx / d.f32(dim);
    const endUv = (startPx + lengthPx) / d.f32(dim);

    let rgb = d.vec3f();
    // Transmittance: 1 = transparent (miss), 0 = blocked (hit)
    let T = d.f32(1);

    let t = startUv;

    const eps = d.f32(0.5) / d.f32(dim);
    const minStep = d.f32(0.25) / d.f32(dim);
    let step = d.u32(0);
    const maxSteps = d.u32(96);

    while (step < maxSteps) {
      if (t > endUv) {
        break;
      }

      const p = probePos.add(dir.mul(t));

      if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) {
        rgb = d.vec3f(0.0);
        T = d.f32(0.0);
        break;
      }

      // Check occluders first
      const occluderDist = sceneOccluderSDF(p);

      if (occluderDist <= eps) {
        rgb = d.vec3f(0.0);
        T = d.f32(0.0);
        break;
      }

      // Check light source
      const lightDist = sdf.sdDisk(p.sub(lightPos), lightRadiusUv);

      if (lightDist <= eps) {
        rgb = d.vec3f(lightColor);
        T = d.f32(0.0);
        break;
      }

      // Use minimum distance for sphere tracing
      const dist = std.min(occluderDist, lightDist);
      t = t + std.max(dist, minStep);
      step = step + d.u32(1);
    }

    const cascadeIndex = d.u32(textureIndex);
    std.textureStore(writeView.$, gid.xy, cascadeIndex, d.vec4f(rgb, T));

    probes = probes / d.u32(2);
    textureIndex = textureIndex + d.u32(1);
  }
});

// --- Merge compute shader ---
// Merge cascade N (t1) with already-merged cascade N+1 (t2), output to dst.
// - probes(N+1) = probes(N) / 2  -> bilinear between 4 surrounding probes
// - raysDim(N+1) = raysDim(N) * 2 -> average 4 consecutive child rays (1D angular)
const mergeCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  if (gid.x >= dim || gid.y >= dim) {
    return;
  }

  const nDim = mergeRaysDimUniform.$; // raysDim for cascade N (u32)
  const uDim = nDim * d.u32(2); // raysDim for cascade N+1 (u32)

  // Current ray (cascade N)
  const rayN = std.textureLoad(mergeBindGroupLayout.$.t1, gid.xy);

  // If near interval is blocking (T ~= 0), it fully determines the result.
  // T is stored in .w: 0 = blocked, 1 = transparent
  if (rayN.w <= 0.001) {
    std.textureStore(mergeBindGroupLayout.$.dst, gid.xy, rayN);
    return;
  }

  const probeCoordN = d.vec2u(gid.x / nDim, gid.y / nDim);
  const localN = d.vec2u(gid.x % nDim, gid.y % nDim);

  // Upper probe grid sizes
  const probesN = d.u32(dim) / nDim;
  const probesU = probesN / d.u32(2);

  // Handle edge case when probesU is very small
  const maxProbeIdx = std.max(probesU, d.u32(1)) - d.u32(1);

  // Base upper probe index and bilinear weights
  const ux0 = std.min(probeCoordN.x / d.u32(2), maxProbeIdx);
  const uy0 = std.min(probeCoordN.y / d.u32(2), maxProbeIdx);

  const ux1 = std.min(ux0 + d.u32(1), maxProbeIdx);
  const uy1 = std.min(uy0 + d.u32(1), maxProbeIdx);

  const rx = probeCoordN.x % d.u32(2);
  const ry = probeCoordN.y % d.u32(2);

  // Bilinear weights
  const fx = (d.f32(rx) + d.f32(0.5)) * d.f32(0.5);
  const fy = (d.f32(ry) + d.f32(0.5)) * d.f32(0.5);

  // 4:1 angular merge using 1D angular indexing
  // Parent angular index in 1D order
  const angN = localN.y * nDim + localN.x;
  const childBase = angN * d.u32(4);

  // Bounds for clamping texture coordinates
  const minCoord = d.vec2u(0, 0);
  const maxCoord = d.vec2u(dim - 1, dim - 1);

  const originTL = d.vec2u(ux0 * uDim, uy0 * uDim);
  const originTR = d.vec2u(ux1 * uDim, uy0 * uDim);
  const originBL = d.vec2u(ux0 * uDim, uy1 * uDim);
  const originBR = d.vec2u(ux1 * uDim, uy1 * uDim);

  // Sample 4 consecutive child rays for TL probe
  const child0 = childBase;
  const child1 = childBase + d.u32(1);
  const child2 = childBase + d.u32(2);
  const child3 = childBase + d.u32(3);

  const childLocal0 = d.vec2u(child0 % uDim, child0 / uDim);
  const childLocal1 = d.vec2u(child1 % uDim, child1 / uDim);
  const childLocal2 = d.vec2u(child2 % uDim, child2 / uDim);
  const childLocal3 = d.vec2u(child3 % uDim, child3 / uDim);

  // TL probe
  const rTL0 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTL.add(childLocal0), minCoord, maxCoord),
  );
  const rTL1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTL.add(childLocal1), minCoord, maxCoord),
  );
  const rTL2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTL.add(childLocal2), minCoord, maxCoord),
  );
  const rTL3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTL.add(childLocal3), minCoord, maxCoord),
  );
  const avgTL = rTL0.add(rTL1).add(rTL2).add(rTL3).mul(0.25);
  const tTL = (rTL0.w + rTL1.w + rTL2.w + rTL3.w) * d.f32(0.25);
  const TL = d.vec4f(avgTL.xyz, tTL);

  // TR probe
  const rTR0 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTR.add(childLocal0), minCoord, maxCoord),
  );
  const rTR1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTR.add(childLocal1), minCoord, maxCoord),
  );
  const rTR2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTR.add(childLocal2), minCoord, maxCoord),
  );
  const rTR3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originTR.add(childLocal3), minCoord, maxCoord),
  );
  const avgTR = rTR0.add(rTR1).add(rTR2).add(rTR3).mul(0.25);
  const tTR = (rTR0.w + rTR1.w + rTR2.w + rTR3.w) * d.f32(0.25);
  const TR = d.vec4f(avgTR.xyz, tTR);

  // BL probe
  const rBL0 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBL.add(childLocal0), minCoord, maxCoord),
  );
  const rBL1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBL.add(childLocal1), minCoord, maxCoord),
  );
  const rBL2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBL.add(childLocal2), minCoord, maxCoord),
  );
  const rBL3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBL.add(childLocal3), minCoord, maxCoord),
  );
  const avgBL = rBL0.add(rBL1).add(rBL2).add(rBL3).mul(0.25);
  const tBL = (rBL0.w + rBL1.w + rBL2.w + rBL3.w) * d.f32(0.25);
  const BL = d.vec4f(avgBL.xyz, tBL);

  // BR probe
  const rBR0 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBR.add(childLocal0), minCoord, maxCoord),
  );
  const rBR1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBR.add(childLocal1), minCoord, maxCoord),
  );
  const rBR2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBR.add(childLocal2), minCoord, maxCoord),
  );
  const rBR3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    std.clamp(originBR.add(childLocal3), minCoord, maxCoord),
  );
  const avgBR = rBR0.add(rBR1).add(rBR2).add(rBR3).mul(0.25);
  const tBR = (rBR0.w + rBR1.w + rBR2.w + rBR3.w) * d.f32(0.25);
  const BR = d.vec4f(avgBR.xyz, tBR);

  // Bilinear interpolation in probe space
  const one = d.f32(1.0);
  const top = TL.mul(one - fx).add(TR.mul(fx));
  const bot = BL.mul(one - fx).add(BR.mul(fx));
  const upper = top.mul(one - fy).add(bot.mul(fy));

  // Merge: near interval transmits (T > 0), so add far interval's radiance
  // weighted by near's transmittance
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

function snapPickerToProbeCenter(uv: { x: number; y: number }, index: number) {
  const probes = baseProbes >> index;
  const raysDim = dim / probes;

  const px = Math.max(0, Math.min(dim - 1, Math.floor(uv.x * dim)));
  const py = Math.max(0, Math.min(dim - 1, Math.floor(uv.y * dim)));

  const bx = Math.floor(px / raysDim);
  const by = Math.floor(py / raysDim);

  const cx = bx * raysDim + Math.floor(raysDim / 2);
  const cy = by * raysDim + Math.floor(raysDim / 2);

  return {
    x: (cx + 0.5) / dim,
    y: (cy + 0.5) / dim,
  };
}

function setCascadeIndex(index: number) {
  const idx = Math.max(0, Math.min(cascadeAmount - 1, Math.floor(index)));
  currentCascadeIndex = idx;

  const probes = baseProbes >> idx;
  const raysDim = dim / probes;
  indexUniform.write(idx);
  raysDimUniform.write(raysDim);

  const snapped = snapPickerToProbeCenter(pickerPos, idx);
  pickerPos = snapped;
  pickerPosUniform.write(d.vec2f(pickerPos.x, pickerPos.y));
}

canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;

  if (event.shiftKey) {
    const snapped = snapPickerToProbeCenter({ x, y }, currentCascadeIndex);
    pickerPos = snapped;
    pickerPosUniform.write(d.vec2f(pickerPos.x, pickerPos.y));
    return;
  }

  lightPos = { x, y };
  lightPosUniform.write(d.vec2f(lightPos.x, lightPos.y));
  updateLighting();
});

canvas.addEventListener('mousemove', (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  mousePosUniform.write(d.vec2f(x, y));

  if (event.buttons === 1) {
    lightPos = { x, y };
    lightPosUniform.write(d.vec2f(lightPos.x, lightPos.y));
    updateLighting();
  }
});

export const controls = {
  'index': {
    initial: 0,
    min: 0,
    max: cascadeAmount - 1,
    step: 1,
    onSliderChange: (value: number) => {
      setCascadeIndex(value);
    },
  },
};

export function onCleanup() {
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
  }
  root.destroy();
}
