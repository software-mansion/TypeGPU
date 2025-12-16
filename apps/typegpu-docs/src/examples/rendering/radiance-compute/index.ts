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

let currentCascadeIndex = 0;
let lightPos = d.vec2f(0.5);
let pickerPos = d.vec2f(0.5);

const indexUniform = root.createUniform(d.u32, 0);
const raysDimUniform = root.createUniform(d.f32, baseRaysDim);
const mousePosUniform = root.createUniform(d.vec2f);
const lightPosUniform = root.createUniform(d.vec2f, lightPos);
const pickerPosUniform = root.createUniform(d.vec2f, pickerPos);
const mergeRaysDimUniform = root.createUniform(d.u32, baseRaysDim);

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
    return SceneResult({ dist: light, color: d.vec3f(1) });
  } else {
    return SceneResult({ dist: minOccluder, color: d.vec3f(0) });
  }
};

// const debugFrag = tgpu['~unstable'].fragmentFn({
//   in: { uv: d.vec2f },
//   out: d.vec4f,
// })(({ uv }) => {
//   const color = std.textureSample(
//     renderView.$,
//     nearestSampler.$,
//     uv,
//     indexUniform.$,
//   );

//   if (std.distance(lightPosUniform.$, uv) < 0.06) {
//     return d.vec4f(1, 0, 0, 1);
//   }
//   if (std.distance(pickerPosUniform.$, uv) < 0.006) {
//     return d.vec4f(0, 0, 1, 1);
//   }

//   const raysDim = raysDimUniform.$;

//   const dir = std.normalize(mousePosUniform.$.sub(pickerPosUniform.$));
//   const t = dirToAngle(dir);

//   const raysPerProbe = raysDim * raysDim;
//   let rayIndex = std.floor(t * raysPerProbe);
//   rayIndex = std.min(rayIndex, raysPerProbe - 1);

//   const iy = std.floor(rayIndex / raysDim);
//   const ix = rayIndex - iy * raysDim;

//   const cpPx = std.floor(pickerPosUniform.$.mul(dim));
//   const probeOrigin = std.floor(cpPx.div(raysDim)).mul(raysDim);
//   const highlightPx = probeOrigin.add(d.vec2f(ix, iy));

//   const fragPx = std.floor(uv.mul(dim));

//   if (fragPx.x === highlightPx.x && fragPx.y === highlightPx.y) {
//     return d.vec4f(1, 1, 0, 1);
//   }

//   return color;
// });

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
  const maxProbeIdxF = d.f32(maxProbeIdx);

  // Map fine probe coord -> coarse probe coord in index space.
  // Because probes are cell-centered, coarse centers are offset by 0.5 fine cell:
  // u = (x_f * probesU) - 0.5  == (probeCoordN + 0.5)/2 - 0.5 == (probeCoordN - 0.5)/2
  const uxf = (d.f32(probeCoordN.x) - d.f32(0.5)) * d.f32(0.5);
  const uyf = (d.f32(probeCoordN.y) - d.f32(0.5)) * d.f32(0.5);

  const ux0f = std.clamp(std.floor(uxf), d.f32(0.0), maxProbeIdxF);
  const uy0f = std.clamp(std.floor(uyf), d.f32(0.0), maxProbeIdxF);

  const ux0 = d.u32(ux0f);
  const uy0 = d.u32(uy0f);

  const ux1 = std.min(ux0 + d.u32(1), maxProbeIdx);
  const uy1 = std.min(uy0 + d.u32(1), maxProbeIdx);

  const fx = std.clamp(uxf - d.f32(ux0), d.f32(0.0), d.f32(1.0));
  const fy = std.clamp(uyf - d.f32(uy0), d.f32(0.0), d.f32(1.0));

  // 4:1 angular merge using 1D angular indexing
  // Parent angular index in 1D order
  const angN = localN.y * nDim + localN.x;
  const childBase = angN * d.u32(4);

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
    originTL.add(childLocal0),
  );
  const rTL1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originTL.add(childLocal1),
  );
  const rTL2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originTL.add(childLocal2),
  );
  const rTL3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originTL.add(childLocal3),
  );
  const avgTL = rTL0.add(rTL1).add(rTL2).add(rTL3).mul(0.25);
  const tTL = (rTL0.w + rTL1.w + rTL2.w + rTL3.w) * d.f32(0.25);
  const TL = d.vec4f(avgTL.xyz, tTL);

  // TR probe
  const rTR0 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originTR.add(childLocal0),
  );
  const rTR1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originTR.add(childLocal1),
  );
  const rTR2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originTR.add(childLocal2),
  );
  const rTR3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originTR.add(childLocal3),
  );
  const avgTR = rTR0.add(rTR1).add(rTR2).add(rTR3).mul(0.25);
  const tTR = (rTR0.w + rTR1.w + rTR2.w + rTR3.w) * d.f32(0.25);
  const TR = d.vec4f(avgTR.xyz, tTR);

  // BL probe
  const rBL0 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBL.add(childLocal0),
  );
  const rBL1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBL.add(childLocal1),
  );
  const rBL2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBL.add(childLocal2),
  );
  const rBL3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBL.add(childLocal3),
  );
  const avgBL = rBL0.add(rBL1).add(rBL2).add(rBL3).mul(0.25);
  const tBL = (rBL0.w + rBL1.w + rBL2.w + rBL3.w) * d.f32(0.25);
  const BL = d.vec4f(avgBL.xyz, tBL);

  // BR probe
  const rBR0 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBR.add(childLocal0),
  );
  const rBR1 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBR.add(childLocal1),
  );
  const rBR2 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBR.add(childLocal2),
  );
  const rBR3 = std.textureLoad(
    mergeBindGroupLayout.$.t2,
    originBR.add(childLocal3),
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
