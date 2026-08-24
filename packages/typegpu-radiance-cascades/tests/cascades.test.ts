import { describe, expect, it } from 'vitest';
import { d, tgpu } from 'typegpu';
import {
  colorSlot,
  getCascadeInfo,
  makeBuildRadianceFieldCompute,
  makeCascadePassCompute,
  sdfSlot,
} from '../src/cascades.ts';

describe('getCascadeInfo', () => {
  it('computes contiguous ray intervals across layers', () => {
    const info = getCascadeInfo(1024, 768);
    for (let i = 1; i < info.layers.length; i++) {
      expect(info.layers[i]?.startUv).toBeCloseTo(info.layers[i - 1]?.endUv ?? Number.NaN, 6);
    }
    expect(info.layers[0]?.startUv).toBe(0);
  });

  it('covers the full diagonal range with the top cascade', () => {
    const info = getCascadeInfo(1024, 768);
    const topLayer = info.layers[info.layers.length - 1];
    expect(topLayer?.endUv ?? 0).toBeGreaterThanOrEqual(info.maxRange);
  });

  it('halves probes and doubles stored rays per layer', () => {
    const info = getCascadeInfo(512, 512, { baseStoredRayDim: 2 });
    for (const layer of info.layers) {
      expect(layer.probes[0]).toBe(Math.max(Math.floor(512 / 2 ** layer.layer), 1));
      expect(layer.raysDimStored).toBe(2 * 2 ** layer.layer);
      expect(layer.raysDimActual).toBe(layer.raysDimStored * 2);
    }
  });

  it('keeps the valid region within the cascade texture', () => {
    for (const [w, h] of [
      [1024, 768],
      [333, 777],
      [1920, 1080],
      [64, 64],
    ] as const) {
      const info = getCascadeInfo(w, h);
      for (const layer of info.layers) {
        expect(layer.validDim[0]).toBeLessThanOrEqual(info.cascadeDim[0]);
        expect(layer.validDim[1]).toBeLessThanOrEqual(info.cascadeDim[1]);
      }
    }
  });

  it('scales probe grid to aspect ratio', () => {
    const wide = getCascadeInfo(2048, 512);
    expect(wide.baseProbes[0]).toBeGreaterThan(wide.baseProbes[1]);
    const tall = getCascadeInfo(512, 2048);
    expect(tall.baseProbes[1]).toBeGreaterThan(tall.baseProbes[0]);
  });

  it('rejects invalid sizes and ray dims', () => {
    expect(() => getCascadeInfo(0, 512)).toThrow();
    expect(() => getCascadeInfo(512, -1)).toThrow();
    expect(() => getCascadeInfo(512, 512, { baseStoredRayDim: 3 as never })).toThrow();
  });
});

const sdfImpl = tgpu.fn([d.vec2f], d.f32)`(uv: vec2f) -> f32 {
  return length(uv - vec2f(0.5)) - 0.25;
}`;
const colorImpl = tgpu.fn([d.vec2f], d.vec3f)`(uv: vec2f) -> vec3f {
  return vec3f(uv, 1.0);
}`;

function resolveCascadePass(
  mergeMode: 'hardware' | 'bilinear-fix',
  hasUpperCascade: boolean,
  useSharedRayDirections = true,
) {
  return tgpu.resolve(
    [makeCascadePassCompute({ mergeMode, hasUpperCascade, useSharedRayDirections })],
    {
      config: (cfg) => cfg.with(sdfSlot, sdfImpl).with(colorSlot, colorImpl),
    },
  );
}

describe('makeCascadePassCompute', () => {
  it('resolves the hardware merge variant', () => {
    expect(resolveCascadePass('hardware', true)).toMatchInlineSnapshot(`
      "struct CascadeLayerParams {
        probes: vec2u,
        probesU: vec2u,
        validDim: vec2u,
        raysDimActual: u32,
        startUv: f32,
        endUv: f32,
        intervalOverlapUv: f32,
        aspect: f32,
        eps: f32,
        minStep: f32,
        hitBias: f32,
      }

      @group(0) @binding(0) var<uniform> layerParams_1: CascadeLayerParams;

      fn part1By1(v: u32) -> u32 {
        let x0 = (v & 65535u);
        let x1 = ((x0 | (x0 << 8u)) & 16711935u);
        let x2 = ((x1 | (x1 << 4u)) & 252645135u);
        let x3 = ((x2 | (x2 << 2u)) & 858993459u);
        return ((x3 | (x3 << 1u)) & 1431655765u);
      }

      fn morton2D(x: u32, y: u32) -> u32 {
        return (part1By1(x) | (part1By1(y) << 1u));
      }

      var<workgroup> sharedRayDirections: array<vec2f, 4>;

      fn rayDirection(rayIndex: f32, rayCountActual: f32, aspect: f32) -> vec2f {
        let angle = (((rayIndex / rayCountActual) * 6.283185307179586f) - 3.141592653589793f);
        let cosA = cos(angle);
        let sinA = -(sin(angle));
        return select(vec2f(cosA, (sinA * aspect)), vec2f((cosA / aspect), sinA), (aspect >= 1f));
      }

      fn rayBoxExitUv(p: vec2f, dir: vec2f) -> f32 {
        var tx = 3.4028234663852886e+38f;
        var ty = 3.4028234663852886e+38f;
        if ((abs(dir.x) > 1e-6f)) {
          tx = select((-(p.x) / dir.x), ((1f - p.x) / dir.x), (dir.x > 0f));
        }
        if ((abs(dir.y) > 1e-6f)) {
          ty = select((-(p.y) / dir.y), ((1f - p.y) / dir.y), (dir.y > 0f));
        }
        return max(0f, min(tx, ty));
      }

      fn sdfImpl(uv: vec2f) -> f32 {
        return length(uv - vec2f(0.5)) - 0.25;
      }

      fn colorImpl(uv: vec2f) -> vec3f {
        return vec3f(uv, 1.0);
      }

      struct RayMarchResult {
        color: vec3f,
        transmittance: f32,
      }

      fn defaultRayMarch(probePos: vec2f, rayDir: vec2f, startT: f32, endT: f32, eps: f32, minStep: f32, bias: f32) -> RayMarchResult {
        var t = startT;
        for (var step_1 = 0u; (step_1 < 64u); step_1++) {
          if ((t > endT)) {
            break;
          }
          let pos = (probePos + (rayDir * t));
          let hitDist = (sdfImpl(pos) + bias);
          if ((hitDist <= eps)) {
            return RayMarchResult(colorImpl(pos), 0f);
          }
          t += max((hitDist * 1f), minStep);
        }
        return RayMarchResult(vec3f(), 1f);
      }

      @group(0) @binding(1) var upper: texture_2d<f32>;

      @group(0) @binding(2) var upperSampler: sampler;

      fn traceHardwareMergeRay(probePos: vec2f, rayDir: vec2f, dirActual: vec2u, probesU: vec2u, startUv: f32, clippedMarchEndUv: f32, marchEndUv: f32, exitUv: f32, eps: f32, minStep: f32, biasUv: f32) -> vec4f {
        let marchResult = defaultRayMarch(probePos, rayDir, startUv, clippedMarchEndUv, eps, minStep, biasUv);
        if (((marchResult.transmittance > 0.01f) && (exitUv > marchEndUv))) {
          let upperDim = textureDimensions(upper);
          let tileOrigin = vec2f((dirActual * probesU));
          let probePixel = clamp((probePos * vec2f(probesU)), vec2f(0.5), (vec2f(probesU) - 0.5f));
          let uvU = ((tileOrigin + probePixel) / vec2f(upperDim));
          let upper_1 = textureSampleLevel(upper, upperSampler, uvU, 0);
          return vec4f((marchResult.color + (upper_1.xyz * marchResult.transmittance)), (marchResult.transmittance * upper_1.w));
        }
        return vec4f(marchResult.color, marchResult.transmittance);
      }

      @group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(8, 8) fn item(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) localIndex: u32) {
        let layerParams = (&layerParams_1);
        let probes = (&(*layerParams).probes);
        let rayCountActual = pow(f32((*layerParams).raysDimActual), 2f);
        let dirStored = (gid.xy / (*probes));
        let aspect = (*layerParams).aspect;
        if ((localIndex < 4u)) {
          let dirActual = ((dirStored * 2u) + vec2u((localIndex & 1u), (localIndex >> 1u)));
          let rayIndex = (f32(morton2D(dirActual.x, dirActual.y)) + 0.5f);
          sharedRayDirections[localIndex] = rayDirection(rayIndex, rayCountActual, aspect);
        }
        workgroupBarrier();
        if (((gid.x >= (*layerParams).validDim.x) || (gid.y >= (*layerParams).validDim.y))) {
          return;
        }
        let probe = (gid.xy % (*probes));
        let probePos = ((vec2f(probe) + 0.5f) / vec2f((*probes)));
        let eps = (*layerParams).eps;
        let minStep = (*layerParams).minStep;
        let biasUv = (*layerParams).hitBias;
        let startUv = (*layerParams).startUv;
        let marchEndUv = ((*layerParams).endUv + (*layerParams).intervalOverlapUv);
        var accum = vec4f();
        for (var i = 0u; (i < 4u); i++) {
          let dirActual = ((dirStored * 2u) + vec2u((i & 1u), (i >> 1u)));
          let rayDir = sharedRayDirections[i];
          let exitUv = rayBoxExitUv(probePos, rayDir);
          let clippedMarchEndUv = min(marchEndUv, exitUv);
          if ((exitUv <= startUv)) {
            accum += vec4f(0, 0, 0, 1);
          }
          else {
            {
              let probesU = (&(*layerParams).probesU);
              accum += traceHardwareMergeRay(probePos, rayDir, dirActual, (*probesU), startUv, clippedMarchEndUv, marchEndUv, exitUv, eps, minStep, biasUv);
            }
          }
        }
        textureStore(dst, gid.xy, (accum / 4f));
      }"
    `);
  });

  it('resolves the bilinear-fix merge variant', () => {
    expect(resolveCascadePass('bilinear-fix', true)).toMatchInlineSnapshot(`
      "struct CascadeLayerParams {
        probes: vec2u,
        probesU: vec2u,
        validDim: vec2u,
        raysDimActual: u32,
        startUv: f32,
        endUv: f32,
        intervalOverlapUv: f32,
        aspect: f32,
        eps: f32,
        minStep: f32,
        hitBias: f32,
      }

      @group(0) @binding(0) var<uniform> layerParams_1: CascadeLayerParams;

      fn part1By1(v: u32) -> u32 {
        let x0 = (v & 65535u);
        let x1 = ((x0 | (x0 << 8u)) & 16711935u);
        let x2 = ((x1 | (x1 << 4u)) & 252645135u);
        let x3 = ((x2 | (x2 << 2u)) & 858993459u);
        return ((x3 | (x3 << 1u)) & 1431655765u);
      }

      fn morton2D(x: u32, y: u32) -> u32 {
        return (part1By1(x) | (part1By1(y) << 1u));
      }

      var<workgroup> sharedRayDirections: array<vec2f, 4>;

      fn rayDirection(rayIndex: f32, rayCountActual: f32, aspect: f32) -> vec2f {
        let angle = (((rayIndex / rayCountActual) * 6.283185307179586f) - 3.141592653589793f);
        let cosA = cos(angle);
        let sinA = -(sin(angle));
        return select(vec2f(cosA, (sinA * aspect)), vec2f((cosA / aspect), sinA), (aspect >= 1f));
      }

      fn rayBoxExitUv(p: vec2f, dir: vec2f) -> f32 {
        var tx = 3.4028234663852886e+38f;
        var ty = 3.4028234663852886e+38f;
        if ((abs(dir.x) > 1e-6f)) {
          tx = select((-(p.x) / dir.x), ((1f - p.x) / dir.x), (dir.x > 0f));
        }
        if ((abs(dir.y) > 1e-6f)) {
          ty = select((-(p.y) / dir.y), ((1f - p.y) / dir.y), (dir.y > 0f));
        }
        return max(0f, min(tx, ty));
      }

      fn bilinearWeight(forkOffset: vec2u, bilinear: vec2f) -> f32 {
        let weightX = select(bilinear.x, (1f - bilinear.x), (forkOffset.x == 0u));
        let weightY = select(bilinear.y, (1f - bilinear.y), (forkOffset.y == 0u));
        return (weightX * weightY);
      }

      struct RayMarchResult {
        color: vec3f,
        transmittance: f32,
      }

      fn sdfImpl(uv: vec2f) -> f32 {
        return length(uv - vec2f(0.5)) - 0.25;
      }

      fn colorImpl(uv: vec2f) -> vec3f {
        return vec3f(uv, 1.0);
      }

      fn defaultRayMarch(probePos: vec2f, rayDir: vec2f, startT: f32, endT: f32, eps: f32, minStep: f32, bias: f32) -> RayMarchResult {
        var t = startT;
        for (var step_1 = 0u; (step_1 < 64u); step_1++) {
          if ((t > endT)) {
            break;
          }
          let pos = (probePos + (rayDir * t));
          let hitDist = (sdfImpl(pos) + bias);
          if ((hitDist <= eps)) {
            return RayMarchResult(colorImpl(pos), 0f);
          }
          t += max((hitDist * 1f), minStep);
        }
        return RayMarchResult(vec3f(), 1f);
      }

      fn defaultTraceSegment(p0: vec2f, p1: vec2f, aspect: f32, eps: f32, minStep: f32, bias: f32) -> RayMarchResult {
        let delta = (p1 - p0);
        let metricDelta = select(vec2f(delta.x, (delta.y / aspect)), vec2f((delta.x * aspect), delta.y), (aspect >= 1f));
        let endT = length(metricDelta);
        if ((endT <= 0f)) {
          return RayMarchResult(vec3f(), 1f);
        }
        let rayDir = (delta / endT);
        return defaultRayMarch(p0, rayDir, 0f, min(endT, rayBoxExitUv(p0, rayDir)), eps, minStep, bias);
      }

      @group(0) @binding(1) var upper: texture_2d<f32>;

      fn traceBilinearFork(tileOriginU: vec2u, upperProbe: vec2u, probesU: vec2u, probePos: vec2f, rayDir: vec2f, startUv: f32, clippedMarchEndUv: f32, marchEndUv: f32, exitUv: f32, aspect: f32, eps: f32, minStep: f32, biasUv: f32) -> vec4f {
        let upperProbePos = ((vec2f(upperProbe) + 0.5f) / vec2f(probesU));
        let near = defaultTraceSegment((probePos + (rayDir * startUv)), (upperProbePos + (rayDir * clippedMarchEndUv)), aspect, eps, minStep, biasUv);
        if (((near.transmittance > 0.01f) && (exitUv > marchEndUv))) {
          let upper_1 = textureLoad(upper, vec2i((tileOriginU + upperProbe)), 0);
          return vec4f((near.color + (upper_1.xyz * near.transmittance)), (near.transmittance * upper_1.w));
        }
        return vec4f(near.color, near.transmittance);
      }

      fn traceBilinearFixMergeRay(probePos: vec2f, rayDir: vec2f, dirActual: vec2u, probesU: vec2u, startUv: f32, clippedMarchEndUv: f32, marchEndUv: f32, exitUv: f32, aspect: f32, eps: f32, minStep: f32, biasUv: f32) -> vec4f {
        let tileOriginU = (dirActual * probesU);
        let samplePos = clamp(((probePos * vec2f(probesU)) - 0.5f), vec2f(), (vec2f(probesU) - 1f));
        let upperBaseProbe = vec2u(floor(samplePos));
        let bilinear = (samplePos - vec2f(upperBaseProbe));
        var forkAccum = vec4f();
        for (var fork = 0u; (fork < 4u); fork++) {
          let forkOffset = vec2u((fork & 1u), (fork >> 1u));
          let upperProbe = min((upperBaseProbe + forkOffset), (probesU - 1u));
          let weight = bilinearWeight(forkOffset, bilinear);
          if ((weight > 0f)) {
            forkAccum += (traceBilinearFork(tileOriginU, upperProbe, probesU, probePos, rayDir, startUv, clippedMarchEndUv, marchEndUv, exitUv, aspect, eps, minStep, biasUv) * weight);
          }
        }
        return forkAccum;
      }

      @group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(8, 8) fn item(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) localIndex: u32) {
        let layerParams = (&layerParams_1);
        let probes = (&(*layerParams).probes);
        let rayCountActual = pow(f32((*layerParams).raysDimActual), 2f);
        let dirStored = (gid.xy / (*probes));
        let aspect = (*layerParams).aspect;
        if ((localIndex < 4u)) {
          let dirActual = ((dirStored * 2u) + vec2u((localIndex & 1u), (localIndex >> 1u)));
          let rayIndex = (f32(morton2D(dirActual.x, dirActual.y)) + 0.5f);
          sharedRayDirections[localIndex] = rayDirection(rayIndex, rayCountActual, aspect);
        }
        workgroupBarrier();
        if (((gid.x >= (*layerParams).validDim.x) || (gid.y >= (*layerParams).validDim.y))) {
          return;
        }
        let probe = (gid.xy % (*probes));
        let probePos = ((vec2f(probe) + 0.5f) / vec2f((*probes)));
        let eps = (*layerParams).eps;
        let minStep = (*layerParams).minStep;
        let biasUv = (*layerParams).hitBias;
        let startUv = (*layerParams).startUv;
        let marchEndUv = ((*layerParams).endUv + (*layerParams).intervalOverlapUv);
        var accum = vec4f();
        for (var i = 0u; (i < 4u); i++) {
          let dirActual = ((dirStored * 2u) + vec2u((i & 1u), (i >> 1u)));
          let rayDir = sharedRayDirections[i];
          let exitUv = rayBoxExitUv(probePos, rayDir);
          let clippedMarchEndUv = min(marchEndUv, exitUv);
          if ((exitUv <= startUv)) {
            accum += vec4f(0, 0, 0, 1);
          }
          else {
            {
              let probesU = (&(*layerParams).probesU);
              accum += traceBilinearFixMergeRay(probePos, rayDir, dirActual, (*probesU), startUv, clippedMarchEndUv, marchEndUv, exitUv, aspect, eps, minStep, biasUv);
            }
          }
        }
        textureStore(dst, gid.xy, (accum / 4f));
      }"
    `);
  });

  it('resolves the top cascade variant without upper sampling', () => {
    expect(resolveCascadePass('hardware', false)).toMatchInlineSnapshot(`
      "struct CascadeLayerParams {
        probes: vec2u,
        probesU: vec2u,
        validDim: vec2u,
        raysDimActual: u32,
        startUv: f32,
        endUv: f32,
        intervalOverlapUv: f32,
        aspect: f32,
        eps: f32,
        minStep: f32,
        hitBias: f32,
      }

      @group(0) @binding(0) var<uniform> layerParams_1: CascadeLayerParams;

      fn part1By1(v: u32) -> u32 {
        let x0 = (v & 65535u);
        let x1 = ((x0 | (x0 << 8u)) & 16711935u);
        let x2 = ((x1 | (x1 << 4u)) & 252645135u);
        let x3 = ((x2 | (x2 << 2u)) & 858993459u);
        return ((x3 | (x3 << 1u)) & 1431655765u);
      }

      fn morton2D(x: u32, y: u32) -> u32 {
        return (part1By1(x) | (part1By1(y) << 1u));
      }

      var<workgroup> sharedRayDirections: array<vec2f, 4>;

      fn rayDirection(rayIndex: f32, rayCountActual: f32, aspect: f32) -> vec2f {
        let angle = (((rayIndex / rayCountActual) * 6.283185307179586f) - 3.141592653589793f);
        let cosA = cos(angle);
        let sinA = -(sin(angle));
        return select(vec2f(cosA, (sinA * aspect)), vec2f((cosA / aspect), sinA), (aspect >= 1f));
      }

      fn rayBoxExitUv(p: vec2f, dir: vec2f) -> f32 {
        var tx = 3.4028234663852886e+38f;
        var ty = 3.4028234663852886e+38f;
        if ((abs(dir.x) > 1e-6f)) {
          tx = select((-(p.x) / dir.x), ((1f - p.x) / dir.x), (dir.x > 0f));
        }
        if ((abs(dir.y) > 1e-6f)) {
          ty = select((-(p.y) / dir.y), ((1f - p.y) / dir.y), (dir.y > 0f));
        }
        return max(0f, min(tx, ty));
      }

      fn sdfImpl(uv: vec2f) -> f32 {
        return length(uv - vec2f(0.5)) - 0.25;
      }

      fn colorImpl(uv: vec2f) -> vec3f {
        return vec3f(uv, 1.0);
      }

      struct RayMarchResult {
        color: vec3f,
        transmittance: f32,
      }

      fn defaultRayMarch(probePos: vec2f, rayDir: vec2f, startT: f32, endT: f32, eps: f32, minStep: f32, bias: f32) -> RayMarchResult {
        var t = startT;
        for (var step_1 = 0u; (step_1 < 64u); step_1++) {
          if ((t > endT)) {
            break;
          }
          let pos = (probePos + (rayDir * t));
          let hitDist = (sdfImpl(pos) + bias);
          if ((hitDist <= eps)) {
            return RayMarchResult(colorImpl(pos), 0f);
          }
          t += max((hitDist * 1f), minStep);
        }
        return RayMarchResult(vec3f(), 1f);
      }

      @group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(8, 8) fn item(@builtin(global_invocation_id) gid: vec3u, @builtin(local_invocation_index) localIndex: u32) {
        let layerParams = (&layerParams_1);
        let probes = (&(*layerParams).probes);
        let rayCountActual = pow(f32((*layerParams).raysDimActual), 2f);
        let dirStored = (gid.xy / (*probes));
        let aspect = (*layerParams).aspect;
        if ((localIndex < 4u)) {
          let dirActual = ((dirStored * 2u) + vec2u((localIndex & 1u), (localIndex >> 1u)));
          let rayIndex = (f32(morton2D(dirActual.x, dirActual.y)) + 0.5f);
          sharedRayDirections[localIndex] = rayDirection(rayIndex, rayCountActual, aspect);
        }
        workgroupBarrier();
        if (((gid.x >= (*layerParams).validDim.x) || (gid.y >= (*layerParams).validDim.y))) {
          return;
        }
        let probe = (gid.xy % (*probes));
        let probePos = ((vec2f(probe) + 0.5f) / vec2f((*probes)));
        let eps = (*layerParams).eps;
        let minStep = (*layerParams).minStep;
        let biasUv = (*layerParams).hitBias;
        let startUv = (*layerParams).startUv;
        let marchEndUv = ((*layerParams).endUv + (*layerParams).intervalOverlapUv);
        var accum = vec4f();
        for (var i = 0u; (i < 4u); i++) {
          let dirActual = ((dirStored * 2u) + vec2u((i & 1u), (i >> 1u)));
          let rayDir = sharedRayDirections[i];
          let exitUv = rayBoxExitUv(probePos, rayDir);
          let clippedMarchEndUv = min(marchEndUv, exitUv);
          if ((exitUv <= startUv)) {
            accum += vec4f(0, 0, 0, 1);
          }
          else {
            {
              let ray = defaultRayMarch(probePos, rayDir, startUv, clippedMarchEndUv, eps, minStep, biasUv);
              accum += vec4f(ray.color, ray.transmittance);
            }
          }
        }
        textureStore(dst, gid.xy, (accum / 4f));
      }"
    `);
  });

  it('memoizes per specialization', () => {
    const a = makeCascadePassCompute({
      mergeMode: 'hardware',
      hasUpperCascade: true,
      useSharedRayDirections: true,
    });
    const b = makeCascadePassCompute({
      mergeMode: 'hardware',
      hasUpperCascade: true,
      useSharedRayDirections: true,
    });
    expect(a).toBe(b);
    const c = makeCascadePassCompute({
      mergeMode: 'bilinear-fix',
      hasUpperCascade: true,
      useSharedRayDirections: true,
    });
    expect(a).not.toBe(c);
    const fallback = makeCascadePassCompute({
      mergeMode: 'hardware',
      hasUpperCascade: true,
      useSharedRayDirections: false,
    });
    expect(fallback).not.toBe(a);
  });

  it('keeps per-invocation direction calculation as a fallback', () => {
    expect(resolveCascadePass('hardware', true, false)).toMatchInlineSnapshot(`
      "struct CascadeLayerParams {
        probes: vec2u,
        probesU: vec2u,
        validDim: vec2u,
        raysDimActual: u32,
        startUv: f32,
        endUv: f32,
        intervalOverlapUv: f32,
        aspect: f32,
        eps: f32,
        minStep: f32,
        hitBias: f32,
      }

      @group(0) @binding(0) var<uniform> layerParams_1: CascadeLayerParams;

      fn part1By1(v: u32) -> u32 {
        let x0 = (v & 65535u);
        let x1 = ((x0 | (x0 << 8u)) & 16711935u);
        let x2 = ((x1 | (x1 << 4u)) & 252645135u);
        let x3 = ((x2 | (x2 << 2u)) & 858993459u);
        return ((x3 | (x3 << 1u)) & 1431655765u);
      }

      fn morton2D(x: u32, y: u32) -> u32 {
        return (part1By1(x) | (part1By1(y) << 1u));
      }

      fn rayDirection(rayIndex: f32, rayCountActual: f32, aspect: f32) -> vec2f {
        let angle = (((rayIndex / rayCountActual) * 6.283185307179586f) - 3.141592653589793f);
        let cosA = cos(angle);
        let sinA = -(sin(angle));
        return select(vec2f(cosA, (sinA * aspect)), vec2f((cosA / aspect), sinA), (aspect >= 1f));
      }

      fn rayBoxExitUv(p: vec2f, dir: vec2f) -> f32 {
        var tx = 3.4028234663852886e+38f;
        var ty = 3.4028234663852886e+38f;
        if ((abs(dir.x) > 1e-6f)) {
          tx = select((-(p.x) / dir.x), ((1f - p.x) / dir.x), (dir.x > 0f));
        }
        if ((abs(dir.y) > 1e-6f)) {
          ty = select((-(p.y) / dir.y), ((1f - p.y) / dir.y), (dir.y > 0f));
        }
        return max(0f, min(tx, ty));
      }

      fn sdfImpl(uv: vec2f) -> f32 {
        return length(uv - vec2f(0.5)) - 0.25;
      }

      fn colorImpl(uv: vec2f) -> vec3f {
        return vec3f(uv, 1.0);
      }

      struct RayMarchResult {
        color: vec3f,
        transmittance: f32,
      }

      fn defaultRayMarch(probePos: vec2f, rayDir: vec2f, startT: f32, endT: f32, eps: f32, minStep: f32, bias: f32) -> RayMarchResult {
        var t = startT;
        for (var step_1 = 0u; (step_1 < 64u); step_1++) {
          if ((t > endT)) {
            break;
          }
          let pos = (probePos + (rayDir * t));
          let hitDist = (sdfImpl(pos) + bias);
          if ((hitDist <= eps)) {
            return RayMarchResult(colorImpl(pos), 0f);
          }
          t += max((hitDist * 1f), minStep);
        }
        return RayMarchResult(vec3f(), 1f);
      }

      @group(0) @binding(1) var upper: texture_2d<f32>;

      @group(0) @binding(2) var upperSampler: sampler;

      fn traceHardwareMergeRay(probePos: vec2f, rayDir: vec2f, dirActual: vec2u, probesU: vec2u, startUv: f32, clippedMarchEndUv: f32, marchEndUv: f32, exitUv: f32, eps: f32, minStep: f32, biasUv: f32) -> vec4f {
        let marchResult = defaultRayMarch(probePos, rayDir, startUv, clippedMarchEndUv, eps, minStep, biasUv);
        if (((marchResult.transmittance > 0.01f) && (exitUv > marchEndUv))) {
          let upperDim = textureDimensions(upper);
          let tileOrigin = vec2f((dirActual * probesU));
          let probePixel = clamp((probePos * vec2f(probesU)), vec2f(0.5), (vec2f(probesU) - 0.5f));
          let uvU = ((tileOrigin + probePixel) / vec2f(upperDim));
          let upper_1 = textureSampleLevel(upper, upperSampler, uvU, 0);
          return vec4f((marchResult.color + (upper_1.xyz * marchResult.transmittance)), (marchResult.transmittance * upper_1.w));
        }
        return vec4f(marchResult.color, marchResult.transmittance);
      }

      @group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(8, 8) fn item(@builtin(global_invocation_id) gid: vec3u) {
        let layerParams = (&layerParams_1);
        let probes = (&(*layerParams).probes);
        let rayCountActual = pow(f32((*layerParams).raysDimActual), 2f);
        let dirStored = (gid.xy / (*probes));
        let aspect = (*layerParams).aspect;
        if (((gid.x >= (*layerParams).validDim.x) || (gid.y >= (*layerParams).validDim.y))) {
          return;
        }
        let probe = (gid.xy % (*probes));
        let probePos = ((vec2f(probe) + 0.5f) / vec2f((*probes)));
        let eps = (*layerParams).eps;
        let minStep = (*layerParams).minStep;
        let biasUv = (*layerParams).hitBias;
        let startUv = (*layerParams).startUv;
        let marchEndUv = ((*layerParams).endUv + (*layerParams).intervalOverlapUv);
        var accum = vec4f();
        for (var i = 0u; (i < 4u); i++) {
          let dirActual = ((dirStored * 2u) + vec2u((i & 1u), (i >> 1u)));
          let rayDir = rayDirection((f32(morton2D(dirActual.x, dirActual.y)) + 0.5f), rayCountActual, aspect);
          let exitUv = rayBoxExitUv(probePos, rayDir);
          let clippedMarchEndUv = min(marchEndUv, exitUv);
          if ((exitUv <= startUv)) {
            accum += vec4f(0, 0, 0, 1);
          }
          else {
            {
              let probesU = (&(*layerParams).probesU);
              accum += traceHardwareMergeRay(probePos, rayDir, dirActual, (*probesU), startUv, clippedMarchEndUv, marchEndUv, exitUv, eps, minStep, biasUv);
            }
          }
        }
        textureStore(dst, gid.xy, (accum / 4f));
      }"
    `);
  });
});

describe('makeBuildRadianceFieldCompute', () => {
  it('resolves for stored ray dim 1', () => {
    expect(tgpu.resolve([makeBuildRadianceFieldCompute({ baseStoredRayDim: 1 })]))
      .toMatchInlineSnapshot(`
        "@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

        @group(0) @binding(1) var src: texture_2d<f32>;

        struct BuildRadianceFieldParams {
          probes: vec2f,
        }

        @group(0) @binding(0) var<uniform> params: BuildRadianceFieldParams;

        @group(0) @binding(2) var srcSampler: sampler;

        @compute @workgroup_size(8, 8) fn item(@builtin(global_invocation_id) gid: vec3u) {
          let dstDim = textureDimensions(dst);
          if (((gid.x >= dstDim.x) || (gid.y >= dstDim.y))) {
            return;
          }
          let srcDim = textureDimensions(src);
          let cascadeProbeDim = (&params.probes);
          let invSrcDim = (1f / vec2f(srcDim));
          let uv = ((vec2f(gid.xy) + 0.5f) / vec2f(dstDim));
          let probePixel = clamp((uv * (*cascadeProbeDim)), vec2f(0.5), ((*cascadeProbeDim) - 0.5f));
          let uvStride = ((*cascadeProbeDim) * invSrcDim);
          let baseSampleUV = (probePixel * invSrcDim);
          var sum = vec3f();
          // unrolled iteration #0
          {
            let offset = (vec2f((0 & 0), (0 >> 0u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // ---
          textureStore(dst, gid.xy, vec4f((sum / 1f), 1f));
        }"
      `);
  });

  it('resolves for stored ray dim 2', () => {
    expect(tgpu.resolve([makeBuildRadianceFieldCompute({ baseStoredRayDim: 2 })]))
      .toMatchInlineSnapshot(`
        "@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

        @group(0) @binding(1) var src: texture_2d<f32>;

        struct BuildRadianceFieldParams {
          probes: vec2f,
        }

        @group(0) @binding(0) var<uniform> params: BuildRadianceFieldParams;

        @group(0) @binding(2) var srcSampler: sampler;

        @compute @workgroup_size(8, 8) fn item(@builtin(global_invocation_id) gid: vec3u) {
          let dstDim = textureDimensions(dst);
          if (((gid.x >= dstDim.x) || (gid.y >= dstDim.y))) {
            return;
          }
          let srcDim = textureDimensions(src);
          let cascadeProbeDim = (&params.probes);
          let invSrcDim = (1f / vec2f(srcDim));
          let uv = ((vec2f(gid.xy) + 0.5f) / vec2f(dstDim));
          let probePixel = clamp((uv * (*cascadeProbeDim)), vec2f(0.5), ((*cascadeProbeDim) - 0.5f));
          let uvStride = ((*cascadeProbeDim) * invSrcDim);
          let baseSampleUV = (probePixel * invSrcDim);
          var sum = vec3f();
          // unrolled iteration #0
          {
            let offset = (vec2f((0 & 1), (0 >> 1u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #1
          {
            let offset = (vec2f((1 & 1), (1 >> 1u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #2
          {
            let offset = (vec2f((2 & 1), (2 >> 1u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #3
          {
            let offset = (vec2f((3 & 1), (3 >> 1u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // ---
          textureStore(dst, gid.xy, vec4f((sum / 4f), 1f));
        }"
      `);
  });

  it('resolves for stored ray dim 4', () => {
    expect(tgpu.resolve([makeBuildRadianceFieldCompute({ baseStoredRayDim: 4 })]))
      .toMatchInlineSnapshot(`
        "@group(0) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

        @group(0) @binding(1) var src: texture_2d<f32>;

        struct BuildRadianceFieldParams {
          probes: vec2f,
        }

        @group(0) @binding(0) var<uniform> params: BuildRadianceFieldParams;

        @group(0) @binding(2) var srcSampler: sampler;

        @compute @workgroup_size(8, 8) fn item(@builtin(global_invocation_id) gid: vec3u) {
          let dstDim = textureDimensions(dst);
          if (((gid.x >= dstDim.x) || (gid.y >= dstDim.y))) {
            return;
          }
          let srcDim = textureDimensions(src);
          let cascadeProbeDim = (&params.probes);
          let invSrcDim = (1f / vec2f(srcDim));
          let uv = ((vec2f(gid.xy) + 0.5f) / vec2f(dstDim));
          let probePixel = clamp((uv * (*cascadeProbeDim)), vec2f(0.5), ((*cascadeProbeDim) - 0.5f));
          let uvStride = ((*cascadeProbeDim) * invSrcDim);
          let baseSampleUV = (probePixel * invSrcDim);
          var sum = vec3f();
          // unrolled iteration #0
          {
            let offset = (vec2f((0 & 3), (0 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #1
          {
            let offset = (vec2f((1 & 3), (1 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #2
          {
            let offset = (vec2f((2 & 3), (2 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #3
          {
            let offset = (vec2f((3 & 3), (3 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #4
          {
            let offset = (vec2f((4 & 3), (4 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #5
          {
            let offset = (vec2f((5 & 3), (5 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #6
          {
            let offset = (vec2f((6 & 3), (6 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #7
          {
            let offset = (vec2f((7 & 3), (7 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #8
          {
            let offset = (vec2f((8 & 3), (8 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #9
          {
            let offset = (vec2f((9 & 3), (9 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #10
          {
            let offset = (vec2f((10 & 3), (10 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #11
          {
            let offset = (vec2f((11 & 3), (11 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #12
          {
            let offset = (vec2f((12 & 3), (12 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #13
          {
            let offset = (vec2f((13 & 3), (13 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #14
          {
            let offset = (vec2f((14 & 3), (14 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // unrolled iteration #15
          {
            let offset = (vec2f((15 & 3), (15 >> 2u)) * uvStride);
            let sample = textureSampleLevel(src, srcSampler, (baseSampleUV + offset), 0);
            sum += sample.xyz;
          }
          // ---
          textureStore(dst, gid.xy, vec4f((sum / 16f), 1f));
        }"
      `);
  });

  it('memoizes per stored ray dim', () => {
    expect(makeBuildRadianceFieldCompute({ baseStoredRayDim: 2 })).toBe(
      makeBuildRadianceFieldCompute({ baseStoredRayDim: 2 }),
    );
  });
});
