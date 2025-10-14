import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';

import { randf } from '@typegpu/noise';
import { Slider } from './slider.ts';
import { CameraController } from './camera.ts';
import { EventHandler } from './events.ts';
import {
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
  AO_BIAS,
  AO_INTENSITY,
  AO_RADIUS,
  AO_STEPS,
  JELLY_ABSORB,
  JELLY_IOR,
  JELLY_SCATTER_STRENGTH,
  JELLY_SCATTER_TINT,
  LINE_HALF_THICK,
  LINE_RADIUS,
  MAX_DIST,
  MAX_INTERNAL_STEPS,
  MAX_STEPS,
  SPECULAR_INTENSITY,
  SPECULAR_POWER,
  SURF_DIST,
} from './constants.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init({
  device: {
    requiredFeatures: ['timestamp-query'],
  },
});
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const NUM_POINTS = 17;

const slider = new Slider(
  root,
  d.vec2f(-1, 0),
  d.vec2f(0.9, 0),
  NUM_POINTS,
  -0.03,
);
const sliderStorage = slider.pointsBuffer.as('readonly');
const controlPointsStorage = slider.controlPointsBuffer.as('readonly');
const normalsStorage = slider.normalsBuffer.as('readonly');
const boundingBoxesStorage = slider.boundingBoxesBuffer.as('readonly');
const bezierTexture = slider.bezierTexture.createView(
  d.textureStorage2d('rgba8unorm', 'read-only'),
);
const bezierBbox = slider.bbox;

let qualityScale = 0.5;
let [width, height] = [
  canvas.width * qualityScale,
  canvas.height * qualityScale,
];

function createTextures() {
  return [0, 1].map(() => {
    const texture = root['~unstable'].createTexture({
      size: [width, height],
      format: 'rgba8unorm',
    }).$usage('storage', 'sampled');

    return {
      write: texture.createView(d.textureStorage2d('rgba8unorm')),
      sampled: texture.createView(),
    };
  });
}

let textures = createTextures();

function createBackgroundDistTexture() {
  const texture = root['~unstable'].createTexture({
    size: [width, height],
    format: 'r32float',
  }).$usage('storage');

  return {
    write: texture.createView(d.textureStorage2d('r32float')),
    read: texture.createView(d.textureStorage2d('r32float', 'read-only')),
  };
}

let backgroundDistTexture = createBackgroundDistTexture();

const filteringSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const backgroundDistLayout = tgpu.bindGroupLayout({
  distanceTexture: {
    storageTexture: d.textureStorage2d('r32float', 'write-only'),
  },
});

const rayMarchLayout = tgpu.bindGroupLayout({
  currentTexture: {
    storageTexture: d.textureStorage2d('rgba8unorm', 'write-only'),
  },
  backgroundDistTexture: {
    storageTexture: d.textureStorage2d('r32float', 'read-only'),
  },
});

const taaResolveLayout = tgpu.bindGroupLayout({
  currentTexture: {
    texture: d.texture2d(),
  },
  historyTexture: {
    texture: d.texture2d(),
  },
  outputTexture: {
    storageTexture: d.textureStorage2d('rgba8unorm', 'write-only'),
  },
});

const sampleLayout = tgpu.bindGroupLayout({
  currentTexture: {
    texture: d.texture2d(),
  },
});

const camera = new CameraController(
  root,
  d.vec3f(0.024, 2.7, 1.9),
  d.vec3f(0, 0, 0),
  d.vec3f(0, 1, 0),
  Math.PI / 4,
  width,
  height,
);
const cameraUniform = camera.cameraUniform;

const DirectionalLight = d.struct({
  direction: d.vec3f,
  color: d.vec3f,
});
const lightUniform = root.createUniform(DirectionalLight, {
  direction: std.normalize(d.vec3f(0.19, -0.24, 0.75)),
  color: d.vec3f(1, 1, 1),
});

const lineInfos = tgpu.workgroupVar(d.arrayOf(d.vec2f, NUM_POINTS));
const controlPoints = tgpu.workgroupVar(d.arrayOf(d.vec2f, NUM_POINTS));
const normals = tgpu.workgroupVar(d.arrayOf(d.vec2f, NUM_POINTS));

const ObjectType = {
  SLIDER: 1,
  BACKGROUND: 2,
} as const;

const HitInfo = d.struct({
  distance: d.f32,
  objectType: d.i32,
  segmentIndex: d.i32,
  segmentT: d.f32,
});

const LineInfo = d.struct({
  closestSegIndex: d.i32,
  t: d.f32,
  distance: d.f32,
});

const BoxIntersection = d.struct({
  hit: d.bool,
  tMin: d.f32,
  tMax: d.f32,
});

const MarchingResult = d.struct({
  color: d.vec4f,
  hitPos: d.vec3f,
});

const sdInflatedPolyline2D = (p: d.v2f, segmentIndex: number) => {
  'kernel';
  const i = segmentIndex + 1;
  const a = lineInfos.$[i - 1];
  const b = lineInfos.$[i];

  // Convert world position to UV coordinates using bezierBbox
  // bezierBbox = [top, right, bottom, left]
  const left = d.f32(bezierBbox[3]);
  const right = d.f32(bezierBbox[1]);
  const bottom = d.f32(bezierBbox[2]);
  const top = d.f32(bezierBbox[0]);

  const uv = d.vec2f(
    (p.x - left) / (right - left),
    (top - p.y) / (top - bottom),
  );

  // Clamp UV to [0, 1] to prevent out-of-bounds access
  const clampedUV = std.clamp(uv, d.vec2f(0, 0), d.vec2f(1, 1));

  // Convert UV to pixel coordinates and sample the bezier distance texture
  const texSize = std.textureDimensions(bezierTexture.$);
  const pixelCoord = d.vec2u(
    d.u32(clampedUV.x * d.f32(texSize.x - 1)),
    d.u32(clampedUV.y * d.f32(texSize.y - 1)),
  );

  const sampledColor = std.textureLoad(bezierTexture.$, pixelCoord);
  const segUnsigned = sampledColor.x;

  // Approximate t by projecting onto line segment a->b
  const ab = b.sub(a);
  const ap = p.sub(a);
  const closestT = std.saturate(std.dot(ap, ab) / std.dot(ab, ab));

  return LineInfo({
    closestSegIndex: i - 1,
    t: closestT,
    distance: segUnsigned,
  });
};

const sliderSdf3D = (position: d.v3f, segmentIndex: number) => {
  'kernel';
  const poly2D = sdInflatedPolyline2D(position.xy, segmentIndex);
  const body = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) -
    LINE_RADIUS;

  const len = lineInfos.$.length;
  const secondLastPoint = lineInfos.$[len - 2];
  const lastPoint = lineInfos.$[len - 1];

  const angle = std.atan2(
    lastPoint.y - secondLastPoint.y,
    lastPoint.x - secondLastPoint.x,
  );
  const rot = d.mat2x2f(
    std.cos(angle),
    -std.sin(angle),
    std.sin(angle),
    std.cos(angle),
  );

  let pieP = position.sub(d.vec3f(secondLastPoint, 0));
  pieP = d.vec3f(rot.mul(pieP.xy), pieP.z);
  const hmm = sdf.sdPie(pieP.zx, d.vec2f(1, 0), LINE_HALF_THICK);
  const extrudeEnd = sdf.opExtrudeY(
    pieP,
    hmm,
    0.001,
  ) - LINE_RADIUS;

  return LineInfo({
    closestSegIndex: poly2D.closestSegIndex,
    t: poly2D.t,
    distance: sdf.opUnion(body, extrudeEnd),
  });
};

const getMainSceneDist = (position: d.v3f) => {
  'kernel';
  return sdf.opSmoothDifference(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0),
    sdf.opExtrudeY(
      position,
      sdf.sdRoundedBox2d(position.xz, d.vec2f(1, 0.2), 0.2),
      0.06,
    ),
    0.01,
  );
};

const sliderApproxDist = (position: d.v3f) => {
  'kernel';
  let dmin = d.f32(1e9);

  for (let i = 1; i < lineInfos.$.length - 1; i++) {
    const a = lineInfos.$[i - 1];
    const b = lineInfos.$[i];

    const dist2D = sdf.sdLine(position.xy, a, b);

    const dist3D = sdf.opExtrudeZ(position, dist2D, LINE_HALF_THICK) -
      LINE_RADIUS;
    dmin = std.min(dmin, dist3D);
  }

  return dmin;
};

const getSceneDist = (position: d.v3f, segmentIndex: number) => {
  'kernel';
  const mainScene = getMainSceneDist(position);
  const poly3D = sliderSdf3D(position, segmentIndex);

  const hitInfo = HitInfo();

  if (poly3D.distance < mainScene) {
    hitInfo.distance = poly3D.distance;
    hitInfo.objectType = ObjectType.SLIDER;
    hitInfo.segmentIndex = poly3D.closestSegIndex;
    hitInfo.segmentT = poly3D.t;
  } else {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.BACKGROUND;
  }
  return hitInfo;
};

const getSceneDistForAO = (position: d.v3f) => {
  'kernel';
  const mainScene = getMainSceneDist(position);
  const sliderApprox = sliderApproxDist(position);
  return std.min(mainScene, sliderApprox);
};

const getNormal = (position: d.v3f, segmentIndex: number) => {
  'kernel';
  const epsilon = 0.0001;
  const xOffset = d.vec3f(epsilon, 0, 0);
  const yOffset = d.vec3f(0, epsilon, 0);
  const zOffset = d.vec3f(0, 0, epsilon);
  const normalX =
    getSceneDist(std.add(position, xOffset), segmentIndex).distance -
    getSceneDist(std.sub(position, xOffset), segmentIndex).distance;
  const normalY =
    getSceneDist(std.add(position, yOffset), segmentIndex).distance -
    getSceneDist(std.sub(position, yOffset), segmentIndex).distance;
  const normalZ =
    getSceneDist(std.add(position, zOffset), segmentIndex).distance -
    getSceneDist(std.sub(position, zOffset), segmentIndex).distance;
  return std.normalize(d.vec3f(normalX, normalY, normalZ));
};

const getNormalMain = (position: d.v3f) => {
  'kernel';
  const epsilon = 0.0001;
  const xOffset = d.vec3f(epsilon, 0, 0);
  const yOffset = d.vec3f(0, epsilon, 0);
  const zOffset = d.vec3f(0, 0, epsilon);
  const normalX = getMainSceneDist(std.add(position, xOffset)) -
    getMainSceneDist(std.sub(position, xOffset));
  const normalY = getMainSceneDist(std.add(position, yOffset)) -
    getMainSceneDist(std.sub(position, yOffset));
  const normalZ = getMainSceneDist(std.add(position, zOffset)) -
    getMainSceneDist(std.sub(position, zOffset));
  return std.normalize(d.vec3f(normalX, normalY, normalZ));
};

const calculateAO = (position: d.v3f, normal: d.v3f) => {
  'kernel';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (let i = 1; i <= AO_STEPS; i++) {
    const sampleHeight = stepDistance * i;
    const samplePosition = std.add(position, std.mul(normal, sampleHeight));
    const distanceToSurface = getSceneDistForAO(samplePosition) - AO_BIAS;
    const occlusionContribution = std.max(
      0.0,
      sampleHeight - distanceToSurface,
    );
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5;
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) {
      break;
    }
  }

  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.saturate(rawAO);
};

const fresnelSchlick = (cosTheta: number, ior1: number, ior2: number) => {
  'kernel';
  const r0 = std.pow((ior1 - ior2) / (ior1 + ior2), 2.0);
  return r0 + (1.0 - r0) * std.pow(1.0 - cosTheta, 5.0);
};

const beerLambert = (sigma: d.v3f, dist: number) => {
  'kernel';
  return std.exp(std.mul(sigma, -dist));
};

const calculateLighting = (
  hitPosition: d.v3f,
  normal: d.v3f,
  rayOrigin: d.v3f,
) => {
  'kernel';
  const lightDir = std.mul(lightUniform.$.direction, -1.0);
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(std.sub(rayOrigin, hitPosition));
  const reflectDir = std.reflect(std.mul(lightDir, -1.0), normal);
  const specularFactor = std.pow(
    std.max(std.dot(viewDir, reflectDir), 0.0),
    SPECULAR_POWER,
  );
  const specular = std.mul(
    std.mul(lightUniform.$.color, specularFactor),
    SPECULAR_INTENSITY,
  );

  const baseColor = d.vec3f(0.9, 0.9, 0.9);
  const directionalLight = std.mul(
    std.mul(baseColor, lightUniform.$.color),
    diffuse,
  );

  const ambientLight = std.mul(
    std.mul(baseColor, AMBIENT_COLOR),
    AMBIENT_INTENSITY,
  );

  return std.add(std.add(directionalLight, ambientLight), specular);
};

const intersectBox = (
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  boxMin: d.v3f,
  boxMax: d.v3f,
) => {
  'kernel';
  const invDir = d.vec3f(1.0).div(rayDirection);

  const t1 = std.sub(boxMin, rayOrigin).mul(invDir);
  const t2 = std.sub(boxMax, rayOrigin).mul(invDir);

  const tMinVec = std.min(t1, t2);
  const tMaxVec = std.max(t1, t2);

  const tMin = std.max(std.max(tMinVec.x, tMinVec.y), tMinVec.z);
  const tMax = std.min(std.min(tMaxVec.x, tMaxVec.y), tMaxVec.z);

  const result = BoxIntersection();
  result.hit = tMax >= tMin && tMax >= 0.0;
  result.tMin = tMin;
  result.tMax = tMax;

  return result;
};

const rayMarchNoJelly = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'kernel';
  let distanceFromOrigin = d.f32();
  let hit = d.f32();

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = std.add(rayOrigin, std.mul(rayDirection, distanceFromOrigin));
    hit = getMainSceneDist(p);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    const pos = std.add(rayOrigin, std.mul(rayDirection, distanceFromOrigin));
    const n = getNormalMain(pos);

    const lit = calculateLighting(pos, n, rayOrigin);
    const ao = calculateAO(pos, n);
    return std.mul(lit, ao);
  }
  return d.vec3f();
};

const backgroundDistFn = tgpu['~unstable'].computeFn({
  workgroupSize: [16, 16],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})(({ gid }) => {
  const dimensions = std.textureDimensions(
    backgroundDistLayout.$.distanceTexture,
  );

  const u = (gid.x / dimensions.x) * 2.0 - 1.0;
  const v = 1.0 - (gid.y / dimensions.y) * 2.0;

  const clipPos = d.vec4f(u, v, -1.0, 1.0);

  const invView = cameraUniform.$.viewInv;
  const invProj = cameraUniform.$.projInv;

  const viewPos = std.mul(invProj, clipPos);
  const viewPosNormalized = d.vec4f(viewPos.xyz.div(viewPos.w), 1.0);

  const worldPos = std.mul(invView, viewPosNormalized);

  const rayOrigin = invView.columns[3].xyz;
  const rayDir = std.normalize(std.sub(worldPos.xyz, rayOrigin));

  let tempDist = d.f32();
  let backgroundHitDist = d.f32(MAX_DIST);

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = std.add(rayOrigin, std.mul(rayDir, tempDist));
    const hit = getMainSceneDist(p);
    tempDist += hit;
    if (hit < SURF_DIST) {
      backgroundHitDist = tempDist;
      break;
    }
    if (tempDist > MAX_DIST) {
      break;
    }
  }

  std.textureStore(
    backgroundDistLayout.$.distanceTexture,
    d.vec2u(gid.x, gid.y),
    d.vec4f(backgroundHitDist, 0.0, 0.0, 0.0),
  );
});

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f, pixelCoord: d.v2u) => {
  'kernel';
  let totalSteps = d.u32();
  const boxCount = boundingBoxesStorage.$.length;

  const backgroundHitDist = std.textureLoad(
    rayMarchLayout.$.backgroundDistTexture,
    pixelCoord,
  ).x;

  // Track closest hit across all boxes
  let closestHitDist = d.f32(MAX_DIST);
  let closestHitResult = MarchingResult();
  let foundHit = d.bool(false);

  // March all intersected boxes and keep closest hit
  for (let boxIdx = 0; boxIdx < boxCount; boxIdx++) {
    const bbox = boundingBoxesStorage.$[boxIdx];
    const intersection = intersectBox(
      rayOrigin,
      rayDirection,
      bbox.min,
      bbox.max,
    );

    if (!intersection.hit) {
      continue;
    }

    // Skip this box if background is hit before it
    if (backgroundHitDist < intersection.tMin) {
      continue;
    }

    // March this box
    let boxDistanceFromOrigin = std.max(d.f32(0.0), intersection.tMin);
    const maxMarchDist = std.min(
      intersection.tMax + 5 * SURF_DIST,
      backgroundHitDist,
    );

    const segIdx = bbox.segmentIndex;
    let boxSteps = d.u32(0);

    for (let i = 0; i < MAX_STEPS; i++) {
      if (totalSteps >= MAX_STEPS || boxSteps >= 32) {
        break;
      }

      const currentPosition = std.add(
        rayOrigin,
        std.mul(rayDirection, boxDistanceFromOrigin),
      );

      const hitInfo = getSceneDist(currentPosition, segIdx);
      boxDistanceFromOrigin += hitInfo.distance;
      totalSteps++;
      boxSteps++;

      if (hitInfo.distance < SURF_DIST) {
        // Found a hit - check if it's closer than previous hits
        if (boxDistanceFromOrigin < closestHitDist) {
          closestHitDist = boxDistanceFromOrigin;
          foundHit = true;

          const hitPosition = std.add(
            rayOrigin,
            std.mul(rayDirection, boxDistanceFromOrigin),
          );
          const normal = getNormal(hitPosition, segIdx);
          const lightDir = std.mul(lightUniform.$.direction, -1.0);
          const litColor = calculateLighting(hitPosition, normal, rayOrigin);

          if (hitInfo.objectType === ObjectType.SLIDER) {
            const N = getNormal(hitPosition, segIdx);
            const I = rayDirection;
            const cosi = std.min(
              1.0,
              std.max(0.0, std.dot(std.mul(I, -1.0), N)),
            );
            const F = fresnelSchlick(cosi, 1.0, JELLY_IOR);

            // Reflection
            const reflDir = std.reflect(I, N);
            const reflOrigin = std.add(
              hitPosition,
              std.mul(N, SURF_DIST * 2.0),
            );
            const reflection = rayMarchNoJelly(reflOrigin, reflDir);

            // Refraction
            const eta = 1.0 / JELLY_IOR;
            const k = 1.0 - eta * eta * (1.0 - cosi * cosi);
            let refractedColor = d.vec3f(0.0, 0.0, 0.0);
            if (k > 0.0) {
              const refrDir = std.normalize(
                std.add(
                  std.mul(I, eta),
                  std.mul(N, eta * cosi - std.sqrt(k)),
                ),
              );
              // March inside jelly to exit
              let p = std.add(hitPosition, std.mul(refrDir, SURF_DIST * 2.0));
              let insideLen = d.f32();
              for (let i = 0; i < MAX_INTERNAL_STEPS; i++) {
                const dIn = sliderSdf3D(p, segIdx).distance;
                const step = std.max(SURF_DIST, std.abs(dIn));
                p = std.add(p, std.mul(refrDir, step));
                insideLen += step;
                if (dIn >= 0.0) break; // exited
              }
              const exitPos = std.add(p, std.mul(refrDir, SURF_DIST * 2.0));
              const env = rayMarchNoJelly(exitPos, refrDir);

              const totalSegments = lineInfos.$.length - 2;
              const progress = (hitInfo.segmentIndex + hitInfo.segmentT) /
                totalSegments;

              const T = beerLambert(
                JELLY_ABSORB.mul(progress ** 2),
                insideLen,
              );
              // Subtle forward-scatter glow
              const forward = std.max(0.0, std.dot(lightDir, refrDir));
              const scatter = std.mul(
                JELLY_SCATTER_TINT,
                JELLY_SCATTER_STRENGTH * forward * progress,
              );
              refractedColor = std.add(std.mul(env, T), scatter);
            }

            const jelly = std.add(
              std.mul(reflection, F),
              std.mul(refractedColor, 1.0 - F),
            );

            closestHitResult = MarchingResult({
              color: d.vec4f(jelly, 1.0),
              hitPos: hitPosition,
            });
          } else {
            const ao = calculateAO(hitPosition, normal);
            const finalColor = std.mul(litColor, ao);

            closestHitResult = MarchingResult({
              color: d.vec4f(finalColor, 1.0),
              hitPos: hitPosition,
            });
          }
        }
        break; // Found hit in this box, move to next box
      }

      if (boxDistanceFromOrigin > maxMarchDist) {
        break;
      }
    }
  }

  // Return closest hit if we found one
  if (foundHit) {
    return closestHitResult;
  }

  // If we didn't hit jelly but we hit the background, render it properly
  if (backgroundHitDist < MAX_DIST) {
    const hitPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, backgroundHitDist),
    );
    const normal = getNormalMain(hitPosition);
    const litColor = calculateLighting(hitPosition, normal, rayOrigin);
    const ao = calculateAO(hitPosition, normal);
    const finalColor = std.mul(litColor, ao);

    return MarchingResult({
      color: d.vec4f(finalColor, 1.0),
      hitPos: hitPosition,
    });
  }

  return MarchingResult();
};

const raymarchFn = tgpu['~unstable'].computeFn({
  workgroupSize: [16, 16],
  in: {
    gid: d.builtin.globalInvocationId,
    lid: d.builtin.localInvocationId,
  },
})(({ gid, lid }) => {
  const localIndex = lid.y * 16 + lid.x;
  if (localIndex < sliderStorage.$.length) {
    lineInfos.$[localIndex] = sliderStorage.$[localIndex];
    controlPoints.$[localIndex] = controlPointsStorage.$[localIndex];
    normals.$[localIndex] = normalsStorage.$[localIndex];
  }

  std.workgroupBarrier();

  const dimensions = std.textureDimensions(rayMarchLayout.$.currentTexture);
  randf.seed2(d.vec2f(gid.xy).div(d.vec2f(dimensions)));

  const u = (gid.x / dimensions.x) * 2.0 - 1.0;
  const v = 1.0 - (gid.y / dimensions.y) * 2.0;

  // TODO: remove debug
  // const bezierDims = std.textureDimensions(bezierTexture.$);
  // const bezierCoord = d.vec2u(
  //   d.u32((d.f32(gid.x) / d.f32(dimensions.x)) * d.f32(bezierDims.x)),
  //   d.u32((d.f32(gid.y) / d.f32(dimensions.y)) * d.f32(bezierDims.y)),
  // );

  // std.textureStore(
  //   rayMarchLayout.$.currentTexture,
  //   d.vec2u(gid.x, gid.y),
  //   std.textureLoad(
  //     bezierTexture.$,
  //     bezierCoord,
  //   ),
  // );

  // return;

  const clipPos = d.vec4f(u, v, -1.0, 1.0);

  const invView = cameraUniform.$.viewInv;
  const invProj = cameraUniform.$.projInv;

  const viewPos = std.mul(invProj, clipPos);
  const viewPosNormalized = d.vec4f(viewPos.xyz.div(viewPos.w), 1.0);

  const worldPos = std.mul(invView, viewPosNormalized);

  const rayOrigin = invView.columns[3].xyz;

  const rayDir = std.normalize(std.sub(worldPos.xyz, rayOrigin));

  const hitInfo = rayMarch(rayOrigin, rayDir, d.vec2u(gid.x, gid.y));

  std.textureStore(
    rayMarchLayout.$.currentTexture,
    d.vec2u(gid.x, gid.y),
    hitInfo.color,
  );
});

const taaResolveFn = tgpu['~unstable'].computeFn({
  workgroupSize: [16, 16],
  in: {
    gid: d.builtin.globalInvocationId,
  },
})(({ gid }) => {
  const currentColor = std.textureLoad(
    taaResolveLayout.$.currentTexture,
    d.vec2u(gid.xy),
    0,
  );

  const historyColor = std.textureLoad(
    taaResolveLayout.$.historyTexture,
    d.vec2u(gid.xy),
    0,
  );

  let minColor = d.vec3f(9999.0);
  let maxColor = d.vec3f(-9999.0);

  const dimensions = std.textureDimensions(taaResolveLayout.$.currentTexture);

  // Sample 3x3 neighborhood to create bounding box in color space
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      const sampleCoord = d.vec2i(gid.xy).add(d.vec2i(x, y));
      // Clamp to texture bounds
      const clampedCoord = std.clamp(
        sampleCoord,
        d.vec2i(0, 0),
        d.vec2i(dimensions.xy).sub(d.vec2i(1)),
      );

      const neighborColor = std.textureLoad(
        taaResolveLayout.$.currentTexture,
        clampedCoord,
        0,
      );

      minColor = std.min(minColor, neighborColor.xyz);
      maxColor = std.max(maxColor, neighborColor.xyz);
    }
  }

  // Clamp history color to neighborhood bounding box
  const historyColorClamped = std.clamp(historyColor.xyz, minColor, maxColor);

  // Blend current with clamped history
  const blendFactor = d.f32(0.9);
  const resolvedColor = d.vec4f(
    std.mix(currentColor.xyz, historyColorClamped, blendFactor),
    1.0,
  );

  std.textureStore(
    taaResolveLayout.$.outputTexture,
    d.vec2u(gid.x, gid.y),
    resolvedColor,
  );
});

const backgroundDistPipeline = root['~unstable']
  .withCompute(backgroundDistFn)
  .createPipeline();

const computePipeline = root['~unstable']
  .withCompute(raymarchFn)
  .createPipeline().withPerformanceCallback((s, e) => {
    console.log(`${Number(e - s) / 1_000_000} ms`);
  });

const taaResolvePipeline = root['~unstable']
  .withCompute(taaResolveFn)
  .createPipeline();

const fullScreenTriangle = tgpu['~unstable'].vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const pos = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const uv = [d.vec2f(0, 1), d.vec2f(2, 1), d.vec2f(0, -1)];

  return {
    pos: d.vec4f(pos[input.vertexIndex], 0, 1),
    uv: uv[input.vertexIndex],
  };
});

const fragmentMain = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  return std.textureSample(
    sampleLayout.$.currentTexture,
    filteringSampler,
    input.uv,
  );
});

const eventHandler = new EventHandler(canvas);

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

let lastTimeStamp = performance.now();
let frameCount = 0;

function createResolvedTextures() {
  return [0, 1].map(() => {
    const texture = root['~unstable'].createTexture({
      size: [width, height],
      format: 'rgba8unorm',
    }).$usage('storage', 'sampled');

    return {
      write: texture.createView(d.textureStorage2d('rgba8unorm')),
      sampled: texture.createView(),
    };
  });
}

let resolvedTextures = createResolvedTextures();

function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  eventHandler.update();
  slider.setDragX(eventHandler.currentMouseX);

  slider.update(deltaTime);

  const currentFrame = frameCount % 2;
  const previousFrame = 1 - currentFrame;

  // First pass: Compute background distances with jittered camera
  backgroundDistPipeline.with(
    backgroundDistLayout,
    root.createBindGroup(backgroundDistLayout, {
      distanceTexture: backgroundDistTexture.write,
    }),
  ).dispatchWorkgroups(
    Math.ceil(width / 16),
    Math.ceil(height / 16),
  );

  // Second pass: Ray march to current texture
  computePipeline.with(
    rayMarchLayout,
    root.createBindGroup(rayMarchLayout, {
      currentTexture: textures[currentFrame].write,
      backgroundDistTexture: backgroundDistTexture.read,
    }),
  ).dispatchWorkgroups(
    Math.ceil(width / 16),
    Math.ceil(height / 16),
  );

  // Third pass: TAA resolve
  taaResolvePipeline.with(
    taaResolveLayout,
    root.createBindGroup(taaResolveLayout, {
      currentTexture: textures[currentFrame].sampled,
      historyTexture: frameCount === 1
        ? textures[currentFrame].sampled
        : resolvedTextures[previousFrame].sampled,
      outputTexture: resolvedTextures[currentFrame].write,
    }),
  ).dispatchWorkgroups(
    Math.ceil(width / 16),
    Math.ceil(height / 16),
  );

  // Fourth pass: Render resolved result to screen
  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(
      sampleLayout,
      root.createBindGroup(
        sampleLayout,
        {
          currentTexture: resolvedTextures[currentFrame].sampled,
        },
      ),
    )
    .draw(3);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);

// #region Example controls and cleanup

export const controls = {
  'Quality': {
    initial: 'Low',
    options: [
      'Very Low',
      'Low',
      'Medium',
      'High',
      'Ultra',
    ],
    onSelectChange: (value: string) => {
      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        'Low': 0.5,
        'Medium': 0.7,
        'High': 0.85,
        'Ultra': 1.0,
      };

      qualityScale = qualityMap[value] || 0.5;
      [width, height] = [
        canvas.width * qualityScale,
        canvas.height * qualityScale,
      ];

      camera.updateProjection(Math.PI / 4, width / height);
      textures = createTextures();
      backgroundDistTexture = createBackgroundDistTexture();
      resolvedTextures = createResolvedTextures();
      frameCount = 0;
    },
  },
  'Light dir': {
    initial: d.vec3f(0.18, -0.30, 0.64),
    min: d.vec3f(-1, -1, -1),
    max: d.vec3f(1, 0, 1),
    step: d.vec3f(0.01, 0.01, 0.01),
    onVectorSliderChange: (v: [number, number, number]) => {
      lightUniform.writePartial({
        direction: std.normalize(d.vec3f(...v)),
      });
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
