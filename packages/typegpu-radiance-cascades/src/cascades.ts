import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import tgpu from 'typegpu';

export const PREAVERAGE_RAY_DIM = 2;
export const PREAVERAGE_RAY_COUNT = PREAVERAGE_RAY_DIM ** 2;

export const MERGE_MODE_HARDWARE = 0;
export const MERGE_MODE_BILINEAR_FIX = 1;

const F32_MAX = 3.40282346e38;

export type MergeMode = 'hardware' | 'bilinear-fix';

export type BaseStoredRayDim = 1 | 2 | 4;

export type CascadeInfoOptions = {
  baseStoredRayDim?: BaseStoredRayDim;
  minCascades?: number;
};

export type CascadeLayerInfo = {
  layer: number;
  probes: [number, number];
  probesU: [number, number];
  validDim: [number, number];
  raysDimStored: number;
  raysDimActual: number;
  startUv: number;
  endUv: number;
};

export type CascadeInfo = {
  baseProbes: [number, number];
  cascadeDim: [number, number];
  cascadeCount: number;
  baseStoredRayDim: BaseStoredRayDim;
  interval0: number;
  maxRange: number;
  layers: CascadeLayerInfo[];
};

const MIN_BASE_PROBES = 16;
const DEFAULT_MIN_CASCADES = 5;

function assertPositiveSize(width: number, height: number) {
  if (!(width > 0) || !(height > 0)) {
    throw new Error('Radiance cascade size must be positive.');
  }
}

function assertBaseStoredRayDim(value: number): asserts value is BaseStoredRayDim {
  if (value !== 1 && value !== 2 && value !== 4) {
    throw new Error('baseStoredRayDim must be 1, 2, or 4.');
  }
}

function shrByPow2(value: number, shift: number) {
  return Math.max(Math.floor(value / 2 ** shift), 1);
}

export function getCascadeInfo(
  width: number,
  height: number,
  options: CascadeInfoOptions = {},
): CascadeInfo {
  assertPositiveSize(width, height);

  const baseStoredRayDim = options.baseStoredRayDim ?? 2;
  assertBaseStoredRayDim(baseStoredRayDim);

  const aspect = width / height;
  const diagonal = Math.sqrt(width ** 2 + height ** 2);

  const closestPowerOfTwo = Math.max(MIN_BASE_PROBES, 2 ** Math.floor(Math.log2(diagonal)));

  let baseProbesX: number;
  let baseProbesY: number;
  if (aspect >= 1) {
    baseProbesX = closestPowerOfTwo;
    baseProbesY = Math.max(MIN_BASE_PROBES, Math.round(closestPowerOfTwo / aspect));
  } else {
    baseProbesX = Math.max(MIN_BASE_PROBES, Math.round(closestPowerOfTwo * aspect));
    baseProbesY = closestPowerOfTwo;
  }

  const baseProbesMin = Math.min(baseProbesX, baseProbesY);
  const interval0 = 1 / baseProbesMin;
  const maxRange = diagonal / Math.min(width, height);

  const cascadeCount = Math.max(
    options.minCascades ?? DEFAULT_MIN_CASCADES,
    Math.ceil(Math.log2((maxRange * 3) / interval0 + 1) / 2),
  );

  const maxStoredRayDim = baseStoredRayDim * 2 ** (cascadeCount - 1);
  const cascadeDimX = Math.max(baseProbesX * baseStoredRayDim, maxStoredRayDim);
  const cascadeDimY = Math.max(baseProbesY * baseStoredRayDim, maxStoredRayDim);

  const layers = Array.from({ length: cascadeCount }, (_, layer): CascadeLayerInfo => {
    const probesX = shrByPow2(baseProbesX, layer);
    const probesY = shrByPow2(baseProbesY, layer);
    const probesUX = shrByPow2(baseProbesX, layer + 1);
    const probesUY = shrByPow2(baseProbesY, layer + 1);
    const raysDimStored = baseStoredRayDim * 2 ** layer;
    const raysDimActual = raysDimStored * PREAVERAGE_RAY_DIM;
    const pow4 = 4 ** layer;
    const startUv = (interval0 * (pow4 - 1)) / 3;
    const endUv = startUv + interval0 * pow4;

    return {
      layer,
      probes: [probesX, probesY],
      probesU: [probesUX, probesUY],
      validDim: [
        Math.min(cascadeDimX, probesX * raysDimStored),
        Math.min(cascadeDimY, probesY * raysDimStored),
      ],
      raysDimStored,
      raysDimActual,
      startUv,
      endUv,
    };
  });

  return {
    baseProbes: [baseProbesX, baseProbesY],
    cascadeDim: [cascadeDimX, cascadeDimY],
    cascadeCount,
    baseStoredRayDim,
    interval0,
    maxRange,
    layers,
  };
}

export function getCascadeDim(width: number, height: number, options: CascadeInfoOptions = {}) {
  const info = getCascadeInfo(width, height, options);
  return [info.cascadeDim[0], info.cascadeDim[1], info.cascadeCount] as const;
}

export const sdfSlot = tgpu.slot<(uv: d.v2f) => number>();
export const colorSlot = tgpu.slot<(uv: d.v2f) => d.v3f>();
export const renderAspectSlot = tgpu.slot<number>(1);
export const maxRayStepsSlot = tgpu.slot<number>(64);
export const rayMarchStepSafetySlot = tgpu.slot<number>(1);

// Slot for SDF resolution to calculate proper texel-based eps/minStep (so we don't do redundant sub-texel steps)
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

  for (let step = 0; step < maxRayStepsSlot.$; step++) {
    if (t > endT) {
      break;
    }
    const pos = probePos + rayDir * t;
    if (std.any(std.lt(pos, d.vec2f(0))) || std.any(std.gt(pos, d.vec2f(1)))) {
      break;
    }

    const signedDist = sdfSlot.$(pos);
    const hitDist = signedDist + bias;
    if (hitDist <= eps) {
      hitPos = d.vec2f(pos);
      didHit = true;
      T = 0;
      break;
    }
    t += std.max(std.max(signedDist, 0) * rayMarchStepSafetySlot.$, minStep);
  }

  if (didHit) {
    rgb = colorSlot.$(hitPos);
  }

  return RayMarchResult({ color: rgb, transmittance: T });
});

export const rayMarchSlot = tgpu.slot(defaultRayMarch);

const segmentMetricLength = tgpu.fn(
  [d.vec2f],
  d.f32,
)((delta) => {
  'use gpu';
  const aspect = d.f32(renderAspectSlot.$);
  if (aspect >= 1) {
    return std.length(d.vec2f(delta.x * aspect, delta.y));
  }
  return std.length(d.vec2f(delta.x, delta.y / aspect));
});

export const defaultTraceSegment = tgpu.fn(
  [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32],
  RayMarchResult,
)((p0, p1, _aspect, eps, minStep, bias) => {
  'use gpu';
  const delta = p1 - p0;
  // Uses renderAspectSlot so the aspect branch resolves during specialization.
  const endT = segmentMetricLength(delta);

  if (endT <= 0) {
    return RayMarchResult({ color: d.vec3f(), transmittance: 1 });
  }

  return rayMarchSlot.$(p0, delta / endT, 0, endT, eps, minStep, bias);
});

export const traceSegmentSlot = tgpu.slot(defaultTraceSegment);

export const CascadeLayerParams = d.struct({
  layer: d.u32,
  probes: d.vec2u,
  probesU: d.vec2u,
  validDim: d.vec2u,
  raysDimStored: d.u32,
  raysDimActual: d.u32,
  startUv: d.f32,
  endUv: d.f32,
  intervalOverlapUv: d.f32,
});

export const cascadePassBGL = tgpu.bindGroupLayout({
  layerParams: { uniform: CascadeLayerParams },
  upper: { texture: d.texture2d() },
  upperSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float') },
});

export type CascadePassSpecialization = {
  hasUpperCascade: boolean;
  mergeModeId: number;
  renderAspect: number;
  epsUv: number;
  minStepUv: number;
  hitBiasUv: number;
};

export type BuildRadianceFieldSpecialization = {
  baseStoredRayDim: BaseStoredRayDim;
  cascadeProbes: [number, number];
};

const rayDirection = (rayIndex: number, rayCountActual: number, aspect: number) => {
  'use gpu';
  const angle = (rayIndex / rayCountActual) * (Math.PI * 2) - Math.PI;
  const cosA = std.cos(angle);
  const sinA = -std.sin(angle);
  if (aspect >= 1) {
    return d.vec2f(cosA / aspect, sinA);
  }
  return d.vec2f(cosA, sinA * aspect);
};

const rayBoxExitUv = tgpu.fn(
  [d.vec2f, d.vec2f],
  d.f32,
)((p, dir) => {
  'use gpu';
  let tx = d.f32(F32_MAX);
  let ty = d.f32(F32_MAX);

  if (std.abs(dir.x) > 1e-6) {
    if (dir.x > 0) {
      tx = (1 - p.x) / dir.x;
    } else {
      tx = -p.x / dir.x;
    }
  }

  if (std.abs(dir.y) > 1e-6) {
    if (dir.y > 0) {
      ty = (1 - p.y) / dir.y;
    } else {
      ty = -p.y / dir.y;
    }
  }

  return std.max(0, std.min(tx, ty));
});

const part1By1 = tgpu.fn(
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

const morton2D = tgpu.fn(
  [d.u32, d.u32],
  d.u32,
)((x, y) => {
  'use gpu';
  return part1By1(x) | (part1By1(y) << 1);
});

const traceDirectRay = (
  probePos: d.v2f,
  rayDir: d.v2f,
  startUv: number,
  clippedMarchEndUv: number,
  eps: number,
  minStep: number,
  biasUv: number,
) => {
  'use gpu';
  const marchResult = rayMarchSlot.$(
    probePos,
    rayDir,
    startUv,
    clippedMarchEndUv,
    eps,
    minStep,
    biasUv,
  );

  return d.vec4f(d.vec3f(marchResult.color), d.f32(marchResult.transmittance));
};

const traceHardwareMergeRay = (
  dim2: d.v2u,
  probePos: d.v2f,
  rayDir: d.v2f,
  dirActual: d.v2u,
  probesU: d.v2u,
  startUv: number,
  clippedMarchEndUv: number,
  marchEndUv: number,
  exitUv: number,
  eps: number,
  minStep: number,
  biasUv: number,
) => {
  'use gpu';
  const marchResult = traceDirectRay(
    probePos,
    rayDir,
    startUv,
    clippedMarchEndUv,
    eps,
    minStep,
    biasUv,
  );
  let rgb = d.vec3f(marchResult.xyz);
  let T = d.f32(marchResult.w);

  if (T > 0.01 && exitUv > marchEndUv) {
    const tileOriginU = dirActual * probesU;
    const tileOrigin = d.vec2f(tileOriginU);
    const probePixel = std.clamp(probePos * d.vec2f(probesU), d.vec2f(0.5), d.vec2f(probesU) - 0.5);
    const uvU = (tileOrigin + probePixel) / d.vec2f(dim2);

    const upper = std.textureSampleLevel(
      cascadePassBGL.$.upper,
      cascadePassBGL.$.upperSampler,
      uvU,
      0,
    );
    rgb = rgb + upper.xyz * T;
    T *= upper.w;
  }

  return d.vec4f(rgb, T);
};

const bilinearWeight = (forkOffset: d.v2u, bilinear: d.v2f) => {
  'use gpu';
  let weight = d.f32(1);

  if (forkOffset.x === 0) {
    weight *= 1 - bilinear.x;
  } else {
    weight *= bilinear.x;
  }

  if (forkOffset.y === 0) {
    weight *= 1 - bilinear.y;
  } else {
    weight *= bilinear.y;
  }

  return weight;
};

const traceBilinearFork = (
  tileOriginU: d.v2u,
  upperProbe: d.v2u,
  probesU: d.v2u,
  probePos: d.v2f,
  rayDir: d.v2f,
  startUv: number,
  clippedMarchEndUv: number,
  marchEndUv: number,
  exitUv: number,
  aspect: number,
  eps: number,
  minStep: number,
  biasUv: number,
) => {
  'use gpu';
  const upperProbePos = (d.vec2f(upperProbe) + 0.5) / d.vec2f(probesU);
  const nearStart = probePos + rayDir * startUv;
  const upperStart = upperProbePos + rayDir * clippedMarchEndUv;
  const near = traceSegmentSlot.$(nearStart, upperStart, aspect, eps, minStep, biasUv);

  let mergedRgb = d.vec3f(near.color);
  let mergedT = d.f32(near.transmittance);

  if (mergedT > 0.01 && exitUv > marchEndUv) {
    const upper = std.textureLoad(cascadePassBGL.$.upper, d.vec2i(tileOriginU + upperProbe), 0);
    mergedRgb = mergedRgb + upper.xyz * mergedT;
    mergedT *= upper.w;
  }

  return d.vec4f(mergedRgb, mergedT);
};

const traceBilinearFixMergeRay = (
  probePos: d.v2f,
  rayDir: d.v2f,
  dirActual: d.v2u,
  probesU: d.v2u,
  startUv: number,
  clippedMarchEndUv: number,
  marchEndUv: number,
  exitUv: number,
  aspect: number,
  eps: number,
  minStep: number,
  biasUv: number,
) => {
  'use gpu';
  const tileOriginU = dirActual * probesU;
  const samplePos = std.clamp(probePos * d.vec2f(probesU) - 0.5, d.vec2f(0), d.vec2f(probesU) - 1);
  const upperBaseProbe = d.vec2u(std.floor(samplePos));
  const bilinear = samplePos - d.vec2f(upperBaseProbe);

  let forkAccum = d.vec4f();

  for (const fork of tgpu.unroll([0, 1, 2, 3])) {
    const forkOffset = d.vec2u(fork & 1, fork >> 1);
    const upperProbe = std.min(upperBaseProbe + forkOffset, probesU - 1);
    const weight = bilinearWeight(forkOffset, bilinear);

    if (weight > 0) {
      forkAccum +=
        traceBilinearFork(
          tileOriginU,
          upperProbe,
          probesU,
          probePos,
          rayDir,
          startUv,
          clippedMarchEndUv,
          marchEndUv,
          exitUv,
          aspect,
          eps,
          minStep,
          biasUv,
        ) * weight;
    }
  }

  return forkAccum;
};

export function makeCascadePassCompute({
  hasUpperCascade,
  mergeModeId,
  renderAspect,
  epsUv,
  minStepUv,
  hitBiasUv,
}: CascadePassSpecialization) {
  return tgpu.computeFn({
    workgroupSize: [8, 8],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const dim2 = std.textureDimensions(cascadePassBGL.$.dst);
    if (gid.x >= dim2.x || gid.y >= dim2.y) {
      return;
    }

    const layerParams = cascadePassBGL.$.layerParams;
    const probes = layerParams.probes;
    const raysDimActual = layerParams.raysDimActual;

    if (gid.x >= layerParams.validDim.x || gid.y >= layerParams.validDim.y) {
      std.textureStore(cascadePassBGL.$.dst, gid.xy, d.vec4f(0, 0, 0, 1));
      return;
    }

    const dirStored = std.div(gid.xy, probes);
    const probe = gid.xy % probes;
    const rayCountActual = d.f32(raysDimActual) ** 2;
    const probePos = (d.vec2f(probe) + 0.5) / d.vec2f(probes);
    const aspect = d.f32(renderAspect);
    const eps = d.f32(epsUv);
    const minStep = d.f32(minStepUv);
    const biasUv = d.f32(hitBiasUv);
    const startUv = layerParams.startUv;
    const endUv = layerParams.endUv;
    const marchEndUv = endUv + layerParams.intervalOverlapUv;

    let accum = d.vec4f();

    for (const i of tgpu.unroll([0, 1, 2, 3])) {
      const dirActual = dirStored * PREAVERAGE_RAY_DIM + d.vec2u(i & 1, i >> 1);
      const rayIndexU = morton2D(dirActual.x, dirActual.y);
      const rayIndex = d.f32(rayIndexU) + 0.5;
      const rayDir = rayDirection(rayIndex, rayCountActual, aspect);
      const exitUv = rayBoxExitUv(probePos, rayDir);
      const clippedMarchEndUv = std.min(marchEndUv, exitUv);

      if (exitUv <= startUv) {
        accum += d.vec4f(0, 0, 0, 1);
      } else if (hasUpperCascade) {
        const probesU = layerParams.probesU;

        if (mergeModeId === MERGE_MODE_HARDWARE) {
          accum += traceHardwareMergeRay(
            dim2,
            probePos,
            rayDir,
            dirActual,
            probesU,
            startUv,
            clippedMarchEndUv,
            marchEndUv,
            exitUv,
            eps,
            minStep,
            biasUv,
          );
        } else {
          accum += traceBilinearFixMergeRay(
            probePos,
            rayDir,
            dirActual,
            probesU,
            startUv,
            clippedMarchEndUv,
            marchEndUv,
            exitUv,
            aspect,
            eps,
            minStep,
            biasUv,
          );
        }
      } else {
        accum += traceDirectRay(probePos, rayDir, startUv, clippedMarchEndUv, eps, minStep, biasUv);
      }
    }

    std.textureStore(cascadePassBGL.$.dst, gid.xy, accum / d.f32(PREAVERAGE_RAY_COUNT));
  });
}

export const buildRadianceFieldBGL = tgpu.bindGroupLayout({
  src: { texture: d.texture2d() },
  srcSampler: { sampler: 'filtering' },
  dst: { storageTexture: d.textureStorage2d('rgba16float') },
});

export function makeBuildRadianceFieldCompute({
  baseStoredRayDim,
  cascadeProbes,
}: BuildRadianceFieldSpecialization) {
  const [cascadeProbesX, cascadeProbesY] = cascadeProbes;
  const storedRayCount = baseStoredRayDim * baseStoredRayDim;

  return tgpu.computeFn({
    workgroupSize: [8, 8],
    in: { gid: d.builtin.globalInvocationId },
  })(({ gid }) => {
    'use gpu';
    const dstDim = std.textureDimensions(buildRadianceFieldBGL.$.dst);
    if (gid.x >= dstDim.x || gid.y >= dstDim.y) {
      return;
    }

    const srcDim = std.textureDimensions(buildRadianceFieldBGL.$.src);
    const cascadeProbeDim = d.vec2u(cascadeProbesX, cascadeProbesY);
    const invSrcDim = 1 / d.vec2f(srcDim);
    const uv = (d.vec2f(gid.xy) + 0.5) / d.vec2f(dstDim);

    const probePixel = std.clamp(
      uv * d.vec2f(cascadeProbeDim),
      d.vec2f(0.5),
      d.vec2f(cascadeProbeDim) - 0.5,
    );

    const uvStride = d.vec2f(cascadeProbeDim) * invSrcDim;
    const baseSampleUV = probePixel * invSrcDim;

    let sum = d.vec3f();

    if (baseStoredRayDim === 1) {
      const sample = std.textureSampleLevel(
        buildRadianceFieldBGL.$.src,
        buildRadianceFieldBGL.$.srcSampler,
        baseSampleUV,
        0,
      );
      sum = sum + sample.xyz;
    } else if (baseStoredRayDim === 2) {
      for (const i of tgpu.unroll([0, 1, 2, 3])) {
        const offset = d.vec2f(i & 1, i >> 1) * uvStride;
        const sample = std.textureSampleLevel(
          buildRadianceFieldBGL.$.src,
          buildRadianceFieldBGL.$.srcSampler,
          baseSampleUV + offset,
          0,
        );
        sum = sum + sample.xyz;
      }
    } else {
      for (const i of tgpu.unroll([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])) {
        const offset = d.vec2f(i & 3, i >> 2) * uvStride;
        const sample = std.textureSampleLevel(
          buildRadianceFieldBGL.$.src,
          buildRadianceFieldBGL.$.srcSampler,
          baseSampleUV + offset,
          0,
        );
        sum = sum + sample.xyz;
      }
    }

    const avg = sum / d.f32(storedRayCount);
    const res = d.vec3f(avg);

    std.textureStore(buildRadianceFieldBGL.$.dst, gid.xy, d.vec4f(res, 1));
  });
}
