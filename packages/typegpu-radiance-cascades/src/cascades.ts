import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import tgpu from 'typegpu';

export function getCascadeDim(width: number, height: number, quality = 0.3) {
  const aspect = width / height;
  const diagonal = Math.sqrt(width ** 2 + height ** 2);
  const base = diagonal * quality;
  // Ensure minimum probe count for low resolutions (at least 16 probes on smallest axis)
  const minPow2 = 16;
  const closestPowerOfTwo = Math.max(
    minPow2,
    2 ** Math.round(Math.log2(base)),
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
  const maxIntervalStart = 1.5;

  // Ensure minimum cascade count for proper light propagation
  const minCascades = 4;
  const cascadeAmount = Math.max(
    minCascades,
    Math.ceil(Math.log2((maxIntervalStart * 3) / interval + 1) / 2),
  );

  return [cascadeDimX, cascadeDimY, cascadeAmount] as const;
}

export const SceneData = d.struct({
  color: d.vec4f, // doing vec3f is asking for trouble (unforunately)
  dist: d.f32,
});

export const sceneSlot = tgpu.slot<(uv: d.v2f) => d.Infer<typeof SceneData>>();

// Result type for ray march function
export const RayMarchResult = d.struct({
  color: d.vec3f,
  transmittance: d.f32, // 1.0 = no hit, 0.0 = fully opaque hit
});

// Default ray march implementation using sceneSlot
export const defaultRayMarch = tgpu.fn(
  [d.vec2f, d.vec2f, d.f32, d.f32, d.f32, d.f32],
  RayMarchResult,
)((probePos, rayDir, startT, endT, eps, minStep) => {
  'use gpu';
  let rgb = d.vec3f();
  let T = d.f32(1);
  let t = startT;

  for (let step = 0; step < 64; step++) {
    if (t > endT) {
      break;
    }
    const hit = sceneSlot.$(probePos.add(rayDir.mul(t)));
    if (hit.dist <= eps) {
      rgb = d.vec3f(hit.color.xyz);
      T = d.f32(0);
      break;
    }
    t += std.max(hit.dist, minStep);
  }

  return RayMarchResult({ color: rgb, transmittance: T });
});

// Slot for custom ray marching with default implementation
export const rayMarchSlot = tgpu.slot(defaultRayMarch);

export const CascadeParams = d.struct({
  layer: d.u32,
  baseProbes: d.vec2u,
  cascadeDim: d.vec2u,
  cascadeCount: d.u32,
});

export const cascadePassBGL = tgpu.bindGroupLayout({
  params: { uniform: CascadeParams },
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

  const params = cascadePassBGL.$.params;
  const probes = d.vec2u(
    std.max(params.baseProbes.x >> params.layer, d.u32(1)),
    std.max(params.baseProbes.y >> params.layer, d.u32(1)),
  );

  const dirStored = gid.xy.div(probes);
  const probe = std.mod(gid.xy, probes);
  const raysDimStored = d.u32(2) << params.layer;
  const raysDimActual = raysDimStored * d.u32(2);
  const rayCountActual = raysDimActual * raysDimActual;

  if (dirStored.x >= raysDimStored || dirStored.y >= raysDimStored) {
    std.textureStore(cascadePassBGL.$.dst, gid.xy, d.vec4f(0, 0, 0, 1));
    return;
  }

  const probePos = d.vec2f(probe).add(0.5).div(d.vec2f(probes));
  const cascadeProbesMinVal = d.f32(
    std.min(params.baseProbes.x, params.baseProbes.y),
  );
  const interval0 = 1.0 / cascadeProbesMinVal;
  const pow4 = d.f32(d.u32(1) << (params.layer * d.u32(2)));
  const startUv = (interval0 * (pow4 - 1.0)) / 3.0;
  const endUv = startUv + interval0 * pow4;
  // Use conservative epsilon values that don't scale too aggressively with resolution
  // This ensures proper hit detection even at low resolution
  const baseEps = d.f32(0.001); // ~0.1% of scene size minimum
  const eps = std.max(baseEps, 0.25 / cascadeProbesMinVal);
  const minStep = std.max(baseEps * 0.5, 0.125 / cascadeProbesMinVal);

  let accum = d.vec4f();

  for (let i = 0; i < 4; i++) {
    const dirActual = dirStored
      .mul(d.u32(2))
      .add(d.vec2u(d.u32(i) & d.u32(1), d.u32(i) >> d.u32(1)));
    const rayIndex = d.f32(dirActual.y * raysDimActual + dirActual.x) + 0.5;
    const angle = (rayIndex / d.f32(rayCountActual)) * (Math.PI * 2) - Math.PI;
    const rayDir = d.vec2f(std.cos(angle), -std.sin(angle));

    // Use ray march slot for customizable ray marching
    const marchResult = rayMarchSlot.$(
      probePos,
      rayDir,
      startUv,
      endUv,
      eps,
      minStep,
    );
    let rgb = d.vec3f(marchResult.color);
    let T = d.f32(marchResult.transmittance);

    if (params.layer < d.u32(params.cascadeCount - 1) && T > 0.01) {
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
    sum = sum.add(
      std.textureSampleLevel(
        buildRadianceFieldBGL.$.src,
        buildRadianceFieldBGL.$.srcSampler,
        baseSampleUV.add(offset),
        0,
      ).xyz,
    );
  }

  std.textureStore(
    buildRadianceFieldBGL.$.dst,
    gid.xy,
    d.vec4f(sum.mul(0.25), 1),
  );
});
