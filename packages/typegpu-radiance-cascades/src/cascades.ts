import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import tgpu from 'typegpu';

const ERODE_BIAS = 2;

export function getCascadeDim(width: number, height: number) {
  const aspect = width / height;
  const diagonal = Math.sqrt(width ** 2 + height ** 2);

  const minPow2 = 16;
  const closestPowerOfTwo = Math.max(
    minPow2,
    2 ** Math.round(Math.log2(diagonal)),
  );

  let cascadeWidth: number;
  let cascadeHeight: number;
  if (aspect >= 1) {
    cascadeWidth = closestPowerOfTwo;
    cascadeHeight = Math.max(minPow2, Math.round(closestPowerOfTwo / aspect));
  } else {
    cascadeWidth = Math.max(minPow2, Math.round(closestPowerOfTwo * aspect));
    cascadeHeight = closestPowerOfTwo;
  }

  const cascadeDimX = cascadeWidth * 2;
  const cascadeDimY = cascadeHeight * 2;

  const interval = 1 / closestPowerOfTwo;
  const maxIntervalStart = 2.0;

  const minCascades = 5;
  const cascadeAmount = Math.max(
    minCascades,
    Math.ceil(Math.log2((maxIntervalStart * 3) / interval + 1) / 2),
  );

  return [cascadeDimX, cascadeDimY, cascadeAmount] as const;
}

export const sdfSlot = tgpu.slot<(uv: d.v2f) => number>();
export const colorSlot = tgpu.slot<(uv: d.v2f) => d.v3f>();

// Slot for SDF resolution to calculate proper texel-based eps/minStep (so we don't do reduntant sub-texel steps)
export const sdfResolutionSlot = tgpu.slot<d.v2u>();

export const RayMarchResult = d.struct({
  color: d.vec3f,
  transmittance: d.f32, // 1.0 = no hit, 0.0 = fully opaque hit
});

export const defaultRayMarch = tgpu.fn(
  [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32],
  RayMarchResult,
)((probePos, rayDir, startT, endT, eps, minStep, bias) => {
  'use gpu';
  let rgb = d.vec3f();
  let T = d.f32(1);
  let t = startT;
  let hitPos = d.vec2f();
  let didHit = false;

  for (let step = 0; step < 64; step++) {
    if (t > endT) {
      break;
    }
    const pos = probePos.add(rayDir.mul(t));
    if (
      std.any(std.lt(pos, d.vec2f(0))) ||
      std.any(std.gt(pos, d.vec2f(1)))
    ) {
      break;
    }

    const dist = std.max(sdfSlot.$(pos) + bias, 0);
    if (dist <= eps) {
      hitPos = d.vec2f(pos);
      didHit = true;
      T = 0;
      break;
    }
    t += std.max(dist, minStep);
  }

  if (didHit) {
    rgb = colorSlot.$(hitPos);
  }

  return RayMarchResult({ color: rgb, transmittance: T });
});

export const rayMarchSlot = tgpu.slot(defaultRayMarch);

export const CascadeStaticParams = d.struct({
  baseProbes: d.vec2u,
  cascadeDim: d.vec2u,
  cascadeCount: d.u32,
});

export const cascadePassBGL = tgpu.bindGroupLayout({
  staticParams: { uniform: CascadeStaticParams },
  layer: { uniform: d.u32 },
  upper: { texture: d.texture2d(d.f32) },
  upperSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

export const cascadePassCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const dim2 = std.textureDimensions(cascadePassBGL.$.dst);
  if (std.any(std.ge(gid.xy, dim2))) {
    return;
  }

  const params = cascadePassBGL.$.staticParams;
  const layer = cascadePassBGL.$.layer;
  const probes = d.vec2u(
    std.max(params.baseProbes.x >> layer, d.u32(1)),
    std.max(params.baseProbes.y >> layer, d.u32(1)),
  );

  const dirStored = gid.xy.div(probes);
  const probe = std.mod(gid.xy, probes);
  const raysDimStored = d.u32(2) << layer;
  const raysDimActual = raysDimStored * 2;
  const rayCountActual = d.f32(raysDimActual) ** 2;

  if (dirStored.x >= raysDimStored || dirStored.y >= raysDimStored) {
    std.textureStore(cascadePassBGL.$.dst, gid.xy, d.vec4f(0, 0, 0, 1));
    return;
  }

  const probePos = d.vec2f(probe).add(0.5).div(d.vec2f(probes));
  const aspect = d.f32(params.baseProbes.x) / d.f32(params.baseProbes.y);
  const cascadeProbesMinVal = d.f32(
    std.min(params.baseProbes.x, params.baseProbes.y),
  );
  const interval0 = 1.0 / cascadeProbesMinVal;
  const pow4 = d.f32(d.u32(1) << (layer * d.u32(2)));
  const startUv = (interval0 * (pow4 - 1.0)) / 3.0;
  const endUv = startUv + interval0 * pow4;

  const sdfDim = sdfResolutionSlot.$;
  const texelSizeMin = 1.0 /
    d.f32(std.max(std.min(sdfDim.x, sdfDim.y), d.u32(1)));
  // Use texel size as minimum threshold to avoid sub-texel stepping
  const eps = std.max(texelSizeMin, 0.25 / cascadeProbesMinVal);
  const minStep = std.max(texelSizeMin * 0.5, 0.125 / cascadeProbesMinVal);
  const biasUv = d.f32(ERODE_BIAS) / cascadeProbesMinVal;

  let accum = d.vec4f();

  for (let i = 0; i < 4; i++) {
    const dirActual = dirStored
      .mul(d.u32(2))
      .add(d.vec2u(d.u32(i) & d.u32(1), d.u32(i) >> d.u32(1)));
    const rayIndex = d.f32(dirActual.y * raysDimActual + dirActual.x) + 0.5;
    const angle = (rayIndex / d.f32(rayCountActual)) * (Math.PI * 2) - Math.PI;
    const cosA = std.cos(angle);
    const sinA = -std.sin(angle);
    let rayDir = d.vec2f(cosA, sinA);
    if (aspect >= d.f32(1)) {
      rayDir = d.vec2f(cosA / aspect, sinA);
    } else {
      rayDir = d.vec2f(cosA, sinA * aspect);
    }

    const marchResult = rayMarchSlot.$(
      probePos,
      rayDir,
      startUv,
      endUv,
      eps,
      minStep,
      biasUv,
    );
    let rgb = d.vec3f(marchResult.color);
    let T = d.f32(marchResult.transmittance);

    if (layer < d.u32(params.cascadeCount - 1) && T > 0.01) {
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
      T *= upper.w;
    }

    accum = accum.add(d.vec4f(rgb, T));
  }

  std.textureStore(cascadePassBGL.$.dst, gid.xy, accum.mul(0.25));
});

export const BuildRadianceFieldParams = d.struct({
  outputProbes: d.vec2u,
  cascadeProbes: d.vec2u,
  cascadeDim: d.vec2u,
});

export const buildRadianceFieldBGL = tgpu.bindGroupLayout({
  params: { uniform: BuildRadianceFieldParams },
  src: { texture: d.texture2d(d.f32) },
  srcSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float', 'write-only') },
});

export const buildRadianceFieldCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const dim2 = std.textureDimensions(buildRadianceFieldBGL.$.dst);
  if (std.any(std.ge(gid.xy, dim2))) {
    return;
  }

  const params = buildRadianceFieldBGL.$.params;

  const invCascadeDim = d.vec2f(1.0).div(d.vec2f(params.cascadeDim));
  const uv = d.vec2f(gid.xy).add(0.5).div(d.vec2f(params.outputProbes));

  const probePixel = std.clamp(
    uv.mul(d.vec2f(params.cascadeProbes)),
    d.vec2f(0.5),
    d.vec2f(params.cascadeProbes).sub(0.5),
  );

  const uvStride = d.vec2f(params.cascadeProbes).mul(invCascadeDim);
  const baseSampleUV = probePixel.mul(invCascadeDim);

  let sum = d.vec3f();
  for (let i = d.u32(0); i < 4; i++) {
    const offset = d.vec2f(d.f32(i & 1), d.f32(i >> 1)).mul(uvStride);
    const sample = std.textureSampleLevel(
      buildRadianceFieldBGL.$.src,
      buildRadianceFieldBGL.$.srcSampler,
      baseSampleUV.add(offset),
      0,
    );
    sum = sum.add(sample.xyz);
  }

  const avg = sum.mul(0.25);
  const res = d.vec3f(avg);

  std.textureStore(
    buildRadianceFieldBGL.$.dst,
    gid.xy,
    d.vec4f(res, 1),
  );
});
