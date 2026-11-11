import { tgpu, std, d } from 'typegpu';
import type { BaseStoredRayDim, MergeMode } from './layout.ts';

export type { BaseStoredRayDim, MergeMode } from './layout.ts';

export const PREAVERAGE_RAY_DIM = 2;
export const PREAVERAGE_RAY_COUNT = PREAVERAGE_RAY_DIM ** 2;

const BILINEAR_TAP_COUNT = 4;

const F32_MAX = 3.40282346e38;

/**
 * Signed distance in scene units (the shorter side measures 1), read by `defaultRayMarch`.
 * @category Shader
 */
export const sdfSlot = /*#__PURE__*/ tgpu.slot<(uv: d.v2f) => number>();
/**
 * Emitted linear RGB at a surface hit, read by `defaultRayMarch`.
 * @category Shader
 */
export const emissionSlot = /*#__PURE__*/ tgpu.slot<(uv: d.v2f) => d.v3f>();
/**
 * Step budget of `defaultRayMarch`.
 * @category Shader
 */
export const maxRayStepsAccess = /*#__PURE__*/ tgpu.accessor(d.u32, 64);
/**
 * Sphere-tracing step multiplier of `defaultRayMarch`, in `(0, 1]`.
 * @category Shader
 */
export const rayMarchStepSafetyAccess = /*#__PURE__*/ tgpu.accessor(d.f32, 1);

/**
 * Return struct of a ray marcher.
 * @category Shader
 */
export const RayMarchResult = /*#__PURE__*/ d.struct({
  color: d.vec3f,
  transmittance: d.f32, // 1.0 = no hit, 0.0 = fully opaque hit
});

const rayBoxExitT = /*#__PURE__*/ tgpu.fn(
  [d.vec2f, d.vec2f],
  d.f32,
)((p, dir) => {
  'use gpu';
  let tx = d.f32(F32_MAX);
  let ty = d.f32(F32_MAX);

  if (std.abs(dir.x) > 1e-6) {
    tx = std.select(-p.x / dir.x, (1 - p.x) / dir.x, dir.x > 0);
  }

  if (std.abs(dir.y) > 1e-6) {
    ty = std.select(-p.y / dir.y, (1 - p.y) / dir.y, dir.y > 0);
  }

  return std.max(0, std.min(tx, ty));
});

/**
 * The built-in sphere tracer. Reads `sdfSlot`, `emissionSlot`, `maxRayStepsAccess` and
 * `rayMarchStepSafetyAccess`.
 * @category Shader
 */
export const defaultRayMarch = /*#__PURE__*/ tgpu.fn(
  [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32, d.f32],
  RayMarchResult,
)((probePos, rayDir, startT, endT, eps, minStep, bias) => {
  'use gpu';
  let t = startT;

  for (let step = d.u32(); step < maxRayStepsAccess.$; step++) {
    if (t > endT) {
      break;
    }

    const pos = probePos + rayDir * t;
    const hitDist = sdfSlot.$(pos) + bias;
    if (hitDist <= eps) {
      return RayMarchResult({ color: emissionSlot.$(pos), transmittance: 0 });
    }

    t += std.max(hitDist * rayMarchStepSafetyAccess.$, minStep);
  }

  return RayMarchResult({ color: d.vec3f(), transmittance: 1 });
});

/**
 * The ray marcher used by the cascade passes. Defaults to `defaultRayMarch`.
 * @category Shader
 */
export const rayMarchSlot = /*#__PURE__*/ tgpu.slot(defaultRayMarch);

const traceSegment = /*#__PURE__*/ tgpu.fn(
  [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32],
  RayMarchResult,
)((p0, p1, aspect, eps, minStep, bias) => {
  'use gpu';
  const delta = p1 - p0;
  const metricDelta = std.select(
    d.vec2f(delta.x, delta.y / aspect),
    d.vec2f(delta.x * aspect, delta.y),
    aspect >= 1,
  );
  const endT = std.length(metricDelta);

  if (endT <= 0) {
    return RayMarchResult({ color: d.vec3f(), transmittance: 1 });
  }

  const rayDir = delta / endT;
  return rayMarchSlot.$(p0, rayDir, 0, std.min(endT, rayBoxExitT(p0, rayDir)), eps, minStep, bias);
});

export const CascadeLayerParams = /*#__PURE__*/ d.struct({
  probes: d.vec2u,
  probesU: d.vec2u,
  validDim: d.vec2u,
  raysDimStored: d.u32,
  startT: d.f32,
  endT: d.f32,
  aspect: d.f32,
  eps: d.f32,
  minStep: d.f32,
  hitBias: d.f32,
});

export const cascadePassBGL = /*#__PURE__*/ tgpu.bindGroupLayout({
  layerParams: { uniform: CascadeLayerParams },
  upper: { texture: d.texture2d() },
  upperSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float') },
});

const part1By1 = /*#__PURE__*/ tgpu.fn(
  [d.u32],
  d.u32,
)((v) => {
  'use gpu';
  const x0 = v & 0x0000ffff;
  const x1 = (x0 | (x0 << 8)) & 0x00ff00ff;
  const x2 = (x1 | (x1 << 4)) & 0x0f0f0f0f;
  const x3 = (x2 | (x2 << 2)) & 0x33333333;
  return (x3 | (x3 << 1)) & 0x55555555;
});

const morton2D = /*#__PURE__*/ tgpu.fn(
  [d.u32, d.u32],
  d.u32,
)((x, y) => {
  'use gpu';
  return part1By1(x) | (part1By1(y) << 1);
});

const traceHardwareMergeRay = (probePos: d.v2f, rayDir: d.v2f, dirActual: d.v2u, exitT: number) => {
  'use gpu';
  const params = cascadePassBGL.$.layerParams;
  const near = rayMarchSlot.$(
    probePos,
    rayDir,
    params.startT,
    std.min(params.endT, exitT),
    params.eps,
    params.minStep,
    params.hitBias,
  );

  if (near.transmittance > 0.01 && exitT > params.endT) {
    const upperDim = std.textureDimensions(cascadePassBGL.$.upper);
    const tileOrigin = d.vec2f(dirActual * params.probesU);
    const probePixel = std.clamp(
      probePos * d.vec2f(params.probesU),
      d.vec2f(0.5),
      d.vec2f(params.probesU) - 0.5,
    );
    const upper = std.textureSampleLevel(
      cascadePassBGL.$.upper,
      cascadePassBGL.$.upperSampler,
      (tileOrigin + probePixel) / d.vec2f(upperDim),
      0,
    );
    return d.vec4f(near.color + upper.xyz * near.transmittance, near.transmittance * upper.w);
  }

  return d.vec4f(near.color, near.transmittance);
};

const bilinearWeight = (forkOffset: d.v2u, bilinear: d.v2f) => {
  'use gpu';
  const weightX = std.select(bilinear.x, 1 - bilinear.x, forkOffset.x === 0);
  const weightY = std.select(bilinear.y, 1 - bilinear.y, forkOffset.y === 0);
  return weightX * weightY;
};

const traceBilinearFork = (
  tileOriginU: d.v2u,
  upperProbe: d.v2u,
  probePos: d.v2f,
  rayDir: d.v2f,
) => {
  'use gpu';
  const params = cascadePassBGL.$.layerParams;
  const upperProbePos = (d.vec2f(upperProbe) + 0.5) / d.vec2f(params.probesU);
  const upperExitT = rayBoxExitT(upperProbePos, rayDir);

  const near = traceSegment(
    probePos + rayDir * params.startT,
    upperProbePos + rayDir * params.endT,
    params.aspect,
    params.eps,
    params.minStep,
    params.hitBias,
  );

  if (near.transmittance > 0.01 && upperExitT > params.endT) {
    const upper = std.textureLoad(cascadePassBGL.$.upper, d.vec2i(tileOriginU + upperProbe), 0);
    return d.vec4f(near.color + upper.xyz * near.transmittance, near.transmittance * upper.w);
  }

  return d.vec4f(near.color, near.transmittance);
};

const traceBilinearFixMergeRay = (probePos: d.v2f, rayDir: d.v2f, dirActual: d.v2u) => {
  'use gpu';
  const probesU = cascadePassBGL.$.layerParams.probesU;
  const tileOriginU = dirActual * probesU;
  const samplePos = std.clamp(probePos * d.vec2f(probesU) - 0.5, d.vec2f(0), d.vec2f(probesU) - 1);
  const upperBaseProbe = d.vec2u(std.floor(samplePos));
  const bilinear = samplePos - d.vec2f(upperBaseProbe);

  let forkAccum = d.vec4f();

  for (let fork = d.u32(); fork < BILINEAR_TAP_COUNT; fork++) {
    const forkOffset = d.vec2u(fork & 1, fork >>> 1);
    const upperProbe = std.min(upperBaseProbe + forkOffset, probesU - 1);
    const weight = bilinearWeight(forkOffset, bilinear);
    if (weight > 0) {
      forkAccum += traceBilinearFork(tileOriginU, upperProbe, probePos, rayDir) * weight;
    }
  }

  return forkAccum;
};

const rayDirection = (rayIndex: number, rayCountActual: number, aspect: number) => {
  'use gpu';
  const angle = (rayIndex / rayCountActual) * (Math.PI * 2) - Math.PI;
  const cosA = std.cos(angle);
  const sinA = -std.sin(angle);
  return std.select(d.vec2f(cosA, sinA * aspect), d.vec2f(cosA / aspect, sinA), aspect >= 1);
};

export const hasUpperCascadeSlot = /*#__PURE__*/ tgpu.slot<boolean>();
export const mergeModeSlot = /*#__PURE__*/ tgpu.slot<MergeMode>();

export const cascadePassCompute = /*#__PURE__*/ tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const layerParams = cascadePassBGL.$.layerParams;
  if (gid.x >= layerParams.validDim.x || gid.y >= layerParams.validDim.y) {
    return;
  }

  const probes = layerParams.probes;
  const raysDimStored = layerParams.raysDimStored;
  const rayCountActual = d.f32(raysDimStored * PREAVERAGE_RAY_DIM) ** 2;
  // Group nearby directions for tracing locality; keep texture storage direction-major
  const dirStored = gid.xy % raysDimStored;
  const probe = gid.xy / raysDimStored;
  const probePos = (d.vec2f(probe) + 0.5) / d.vec2f(probes);

  let accum = d.vec4f();

  for (let i = d.u32(); i < PREAVERAGE_RAY_COUNT; i++) {
    const dirActual = dirStored * PREAVERAGE_RAY_DIM + d.vec2u(i & 1, i >>> 1);
    const rayIndex = d.f32(morton2D(dirActual.x, dirActual.y)) + 0.5;
    const rayDir = rayDirection(rayIndex, rayCountActual, layerParams.aspect);
    const exitT = rayBoxExitT(probePos, rayDir);

    if (exitT <= layerParams.startT) {
      accum += d.vec4f(0, 0, 0, 1);
    } else if (hasUpperCascadeSlot.$) {
      if (mergeModeSlot.$ === 'hardware') {
        accum += traceHardwareMergeRay(probePos, rayDir, dirActual, exitT);
      } else {
        accum += traceBilinearFixMergeRay(probePos, rayDir, dirActual);
      }
    } else {
      const ray = rayMarchSlot.$(
        probePos,
        rayDir,
        layerParams.startT,
        std.min(layerParams.endT, exitT),
        layerParams.eps,
        layerParams.minStep,
        layerParams.hitBias,
      );
      accum += d.vec4f(ray.color, ray.transmittance);
    }
  }

  std.textureStore(
    cascadePassBGL.$.dst,
    dirStored * probes + probe,
    accum / d.f32(PREAVERAGE_RAY_COUNT),
  );
});

export const BuildRadianceFieldParams = /*#__PURE__*/ d.struct({
  probes: d.vec2f,
});

export const buildRadianceFieldBGL = /*#__PURE__*/ tgpu.bindGroupLayout({
  params: { uniform: BuildRadianceFieldParams },
  src: { texture: d.texture2d() },
  srcSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float') },
});

export const baseStoredRayDimSlot = /*#__PURE__*/ tgpu.slot<BaseStoredRayDim>();

export const buildRadianceFieldCompute = /*#__PURE__*/ tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const dstDim = std.textureDimensions(buildRadianceFieldBGL.$.dst);
  if (gid.x >= dstDim.x || gid.y >= dstDim.y) {
    return;
  }

  const srcDim = std.textureDimensions(buildRadianceFieldBGL.$.src);
  const cascadeProbeDim = buildRadianceFieldBGL.$.params.probes;
  const invSrcDim = 1 / d.vec2f(srcDim);
  const uv = (d.vec2f(gid.xy) + 0.5) / d.vec2f(dstDim);

  const probePixel = std.clamp(uv * cascadeProbeDim, d.vec2f(0.5), cascadeProbeDim - 0.5);

  const uvStride = cascadeProbeDim * invSrcDim;
  const baseSampleUV = probePixel * invSrcDim;

  let sum = d.vec3f();

  for (const y of tgpu.unroll(std.range(baseStoredRayDimSlot.$))) {
    for (const x of tgpu.unroll(std.range(baseStoredRayDimSlot.$))) {
      const offset = d.vec2f(x, y) * uvStride;
      const sample = std.textureSampleLevel(
        buildRadianceFieldBGL.$.src,
        buildRadianceFieldBGL.$.srcSampler,
        baseSampleUV + offset,
        0,
      );
      sum += sample.xyz;
    }
  }

  std.textureStore(
    buildRadianceFieldBGL.$.dst,
    gid.xy,
    d.vec4f(sum / d.f32(baseStoredRayDimSlot.$ ** 2), 1),
  );
});
