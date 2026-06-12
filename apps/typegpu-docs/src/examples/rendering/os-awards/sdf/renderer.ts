import { perlin3d } from '@typegpu/noise';
import tgpu, { common, d, std, type TgpuRoot } from 'typegpu';
import { fresnelSchlick } from '../common/pbr.ts';
import {
  isInEpoxyRegion,
  modelDirToWorld,
  PbrSurface,
  primaryRayDir,
  sampleEnv,
  sampleMaterial,
  type SharedBindGroup,
  sharedLayout,
  shadeDirectLights,
  shadeOpaque,
  tonemapForDisplay,
} from '../common/shading.ts';
import { scene } from '../scene.ts';
import {
  awardBoundsCenter,
  awardBoundsRadius,
  awardShieldMinY,
  sdAwardSmooth,
  sdEpoxyWood,
} from './shape.ts';
import { awardUv } from './uv.ts';

const MARCH_MAX_STEPS = 128;
const MARCH_SURF_DIST = 4e-4;
const EPOXY_MAX_BOUNCES = 6;
const EPOXY_SEGMENT_STEPS = 40;
const EPOXY_SURF_DIST = 3e-4;

const sdfNormal =
  (sd: (p: d.v3f) => number) =>
  (p: d.v3f): d.v3f => {
    'use gpu';
    const h = 5e-4;
    const k = d.vec2f(1, -1);
    return std.normalize(
      k.xyy * sd(p + k.xyy * h) +
        k.yyx * sd(p + k.yyx * h) +
        k.yxy * sd(p + k.yxy * h) +
        k.xxx * sd(p + k.xxx * h),
    );
  };
const awardNormal = sdfNormal(sdAwardSmooth);
const woodNormal = sdfNormal(sdEpoxyWood);

const marchAward = (ro: d.v3f, rd: d.v3f): number => {
  'use gpu';
  const oc = ro - awardBoundsCenter;
  const b = std.dot(oc, rd);
  const c = std.dot(oc, oc) - awardBoundsRadius * awardBoundsRadius;
  const disc = b * b - c;
  if (disc < 0) {
    return d.f32(-1);
  }
  const sq = std.sqrt(disc);
  const tFar = -b + sq;
  if (tFar < 0) {
    return d.f32(-1);
  }

  let t = std.max(-b - sq, 0);
  for (let i = 0; i < MARCH_MAX_STEPS; i++) {
    const p = ro + rd * t;
    const dist = sdAwardSmooth(p);
    if (dist < MARCH_SURF_DIST) {
      return t;
    }
    t += dist;
    if (t > tFar) {
      break;
    }
  }
  return d.f32(-1);
};

const mirrorWobble = (p: d.v3f): d.v3f => {
  'use gpu';
  const q = p * scene.sdfEpoxy.mirrorWobble.frequency;
  return (
    d.vec3f(
      perlin3d.sample(q),
      perlin3d.sample(q + d.vec3f(2.7, 5.3, 1.1)),
      perlin3d.sample(q + d.vec3f(4.1, 0.9, 6.4)),
    ) * scene.sdfEpoxy.mirrorWobble.strength
  );
};

const shadeEpoxyWood = (hit: d.v3f, normal: d.v3f): d.v3f => {
  'use gpu';
  const worldWoodNormal = modelDirToWorld(normal);
  const uv = awardUv(hit, d.vec3f(1, 0, 0));
  const woodAlbedo =
    std.textureSampleLevel(
      sharedLayout.$.baseColor,
      sharedLayout.$.filteringSampler,
      uv,
      scene.sdfEpoxy.woodLod,
    ).rgb * sharedLayout.$.material.baseColorFactor.rgb;
  const irradiance = sampleEnv(worldWoodNormal, scene.environment.irradianceMipBias);
  let lighting =
    irradiance * (scene.lighting.ambientStrength / Math.PI) +
    scene.lighting.venueBounce.color * scene.lighting.venueBounce.strength;
  for (const light of tgpu.unroll(scene.lighting.directLights)) {
    lighting +=
      light.color *
      ((std.max(std.dot(worldWoodNormal, std.normalize(light.direction)), 0) * light.strength) /
        Math.PI);
  }
  return woodAlbedo * lighting;
};

const traceEpoxyInterior = (entryPos: d.v3f, entryDir: d.v3f): d.v3f => {
  'use gpu';
  let pos = d.vec3f(entryPos);
  let dir = d.vec3f(entryDir);
  let throughput = d.vec3f(1);
  let pathLength = d.f32(0);
  for (let bounce = 0; bounce < EPOXY_MAX_BOUNCES; bounce++) {
    let t = d.f32(1e-3);
    for (let i = 0; i < EPOXY_SEGMENT_STEPS; i++) {
      const p = pos + dir * t;
      const dist = std.min(
        scene.epoxy.bounds.max.x - std.abs(p.x),
        std.min(sdEpoxyWood(p), -sdAwardSmooth(p)),
      );
      if (dist < EPOXY_SURF_DIST) {
        break;
      }
      t += dist;
    }
    const hit = pos + dir * t;
    pathLength += t;
    const absorbed = std.exp(scene.sdfEpoxy.absorption * -pathLength);
    const wallDist = scene.epoxy.bounds.max.x - std.abs(hit.x);
    const woodDist = sdEpoxyWood(hit);
    const boundaryDist = -sdAwardSmooth(hit);

    if (woodDist < wallDist && woodDist < boundaryDist) {
      return shadeEpoxyWood(hit, woodNormal(hit)) * throughput * absorbed;
    }
    if (boundaryDist < wallDist) {
      const exitNormal = awardNormal(hit);
      const outDir = std.refract(dir, std.neg(exitNormal), scene.sdfEpoxy.ior);
      if (std.dot(outDir, outDir) > 0.5) {
        const env = sampleEnv(modelDirToWorld(outDir), scene.sdfEpoxy.exitLod);
        return env * throughput * absorbed;
      }
      dir = std.reflect(dir, exitNormal);
      pos = d.vec3f(hit);
    } else {
      const wallNormal = d.vec3f(-std.sign(hit.x), 0, 0);
      if (hit.y < awardShieldMinY) {
        return shadeEpoxyWood(hit, wallNormal) * throughput * absorbed;
      }
      const mirrorNormal = std.normalize(wallNormal + mirrorWobble(hit));
      const cosWall = std.max(std.dot(std.neg(dir), mirrorNormal), 0);
      throughput = throughput * fresnelSchlick(cosWall, scene.sdfEpoxy.wallF0);
      dir = std.reflect(dir, mirrorNormal);
      pos = d.vec3f(hit);
    }
  }
  const absorbed = std.exp(scene.sdfEpoxy.absorption * -pathLength);
  const env = sampleEnv(modelDirToWorld(dir), scene.sdfEpoxy.exitLod);
  return env * throughput * absorbed;
};

const shadeEpoxy = (
  modelPos: d.v3f,
  modelNormal: d.v3f,
  modelRayDir: d.v3f,
  worldPos: d.v3f,
  worldNormal: d.v3f,
): d.v3f => {
  'use gpu';
  const viewDir = std.normalize(sharedLayout.$.camera.position.xyz - worldPos);
  const nDotV = std.max(std.dot(worldNormal, viewDir), 0);
  const fresnel = fresnelSchlick(nDotV, scene.sdfEpoxy.f0);

  const surface = PbrSurface({
    albedo: d.vec3f(),
    roughness: scene.sdfEpoxy.surfaceRoughness,
    metallic: 0,
    normal: worldNormal,
    viewDir,
    f0: scene.sdfEpoxy.f0,
    nDotV,
  });
  const direct = shadeDirectLights(surface);
  const reflectDir = std.reflect(std.neg(viewDir), worldNormal);
  const surfaceReflection = sampleEnv(
    reflectDir,
    scene.sdfEpoxy.surfaceRoughness ** 2 * scene.environment.maxSpecularMipBias,
  );

  const refractedDir = std.refract(modelRayDir, modelNormal, 1 / scene.sdfEpoxy.ior);
  const interior = traceEpoxyInterior(modelPos, refractedDir);
  return direct + surfaceReflection * fresnel + (1 - fresnel) * interior;
};

const sdfFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const worldDir = primaryRayDir(input.uv);
  const ro = (sharedLayout.$.awardTransformInverse * d.vec4f(sharedLayout.$.camera.position.xyz, 1))
    .xyz;
  const rd = std.normalize((sharedLayout.$.awardTransformInverse * d.vec4f(worldDir, 0)).xyz);

  const t = marchAward(ro, rd);
  if (t < 0) {
    std.discard();
  }

  const modelHit = ro + rd * t;
  const modelNormal = awardNormal(modelHit);
  const worldHit = (sharedLayout.$.awardTransform * d.vec4f(modelHit, 1)).xyz;
  const worldNormal = modelDirToWorld(modelNormal);

  const material = sampleMaterial(awardUv(modelHit, modelNormal));
  let color = d.vec3f();
  if (isInEpoxyRegion(modelHit)) {
    color = shadeEpoxy(modelHit, modelNormal, rd, worldHit, worldNormal);
  } else {
    color = shadeOpaque(
      material.albedo,
      material.roughness,
      material.metallic,
      worldNormal,
      worldHit,
    );
  }

  return d.vec4f(tonemapForDisplay(color), 1);
});

export function createSdfRenderer(root: TgpuRoot, context: GPUCanvasContext) {
  const perlinCache = perlin3d.staticCache({ root, size: d.vec3u(7) });

  const pipeline = root.pipe(perlinCache.inject()).createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: sdfFragment,
  });

  return {
    draw(sharedBindGroup: SharedBindGroup) {
      pipeline.with(sharedBindGroup).withColorAttachment({ view: context, loadOp: 'load' }).draw(3);
    },
    destroy() {
      perlinCache.destroy();
    },
  };
}
