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
  DEBUG_GIZMOS,
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

const NUM_POINTS = 16;

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
    const depthTexture = root['~unstable'].createTexture({
      size: [width, height],
      format: 'r32float',
    }).$usage('storage', 'sampled');

    return {
      write: texture.createView(d.textureStorage2d('rgba8unorm')),
      sampled: texture.createView(),
      depth: depthTexture.createView(
        d.textureStorage2d('r32float', 'read-write'),
      ),
      depthSampled: depthTexture.createView(d.texture2d(), {
        sampleType: 'unfilterable-float',
      }),
    };
  });
}

let textures = createTextures();

const filteringSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const rayMarchLayout = tgpu.bindGroupLayout({
  currentTexture: {
    storageTexture: d.textureStorage2d('rgba8unorm', 'write-only'),
  },
  currentDepth: {
    storageTexture: d.textureStorage2d('r32float', 'write-only'),
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

const bboxCenterX = tgpu.privateVar(d.f32, 0);
const lineInfos = tgpu.workgroupVar(d.arrayOf(d.vec2f, NUM_POINTS));
const controlPoints = tgpu.workgroupVar(d.arrayOf(d.vec2f, NUM_POINTS));
const normals = tgpu.workgroupVar(d.arrayOf(d.vec2f, NUM_POINTS));

const HitInfo = d.struct({
  distance: d.f32,
  objectType: d.i32,
  segmentIndex: d.i32,
  segmentT: d.f32,
});

const sdDebugPoints = (p: d.v3f) => {
  'kernel';
  let dmin = d.f32(1e9);
  for (let i = 0; i < NUM_POINTS; i++) {
    const pt = lineInfos.$[i];
    const dist = sdf.sdSphere(p.sub(d.vec3f(pt, 0)), 0.03);
    if (dist < dmin) dmin = dist;
  }
  return dmin;
};

const sdDebugControlPoints = (p: d.v3f) => {
  'kernel';
  let dmin = d.f32(1e9);
  for (let i = 0; i < NUM_POINTS; i++) {
    const pt = controlPoints.$[i];
    const dist = sdf.sdSphere(p.sub(d.vec3f(pt, 0)), 0.03);
    if (dist < dmin) dmin = dist;
  }
  return dmin;
};

const sdDebugNormals = (p: d.v3f) => {
  'kernel';
  let dmin = d.f32(1e9);
  for (let i = 0; i < NUM_POINTS; i++) {
    const pt = lineInfos.$[i];
    const n = normals.$[i];
    const a = d.vec3f(pt, 0);
    const b = d.vec3f(pt, 0).add(d.vec3f(n, 0).mul(0.2));
    const dist = sdf.sdCapsule(p, a, b, 0.01);
    if (dist < dmin) dmin = dist;
  }
  return dmin;
};

const LineInfo = d.struct({
  closestSegIndex: d.i32,
  t: d.f32,
  distance: d.f32,
});

const sdInflatedPolyline2D = (p: d.v2f) => {
  'kernel';
  let dmin = d.f32(1e9);
  let closestSegIndex = d.i32();
  let closestT = d.f32();

  for (let i = 1; i < lineInfos.$.length - 1; i++) {
    const a = lineInfos.$[i - 1];
    const b = lineInfos.$[i];
    const segCenterX = (a.x + b.x) * 0.5;
    if (std.abs(bboxCenterX.$ - segCenterX) > 0.3) {
      continue;
    }
    const c = controlPoints.$[i - 1];

    const segUnsigned = sdf.sdBezier(p, a, c, b);

    if (segUnsigned < dmin) {
      closestSegIndex = i - 1;
      dmin = segUnsigned;

      // Approximate t by projecting onto line segment a->b
      const ab = b.sub(a);
      const ap = p.sub(a);
      closestT = std.saturate(std.dot(ap, ab) / std.dot(ab, ab));
    }
  }

  return LineInfo({
    closestSegIndex,
    t: closestT,
    distance: dmin,
  });
};

const sliderSdf3D = (position: d.v3f) => {
  'kernel';
  const poly2D = sdInflatedPolyline2D(position.xy);
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

const getSceneDist = (position: d.v3f) => {
  'kernel';
  const mainScene = getMainSceneDist(position);
  const poly3D = sliderSdf3D(position);

  const hitInfo = HitInfo();

  if (DEBUG_GIZMOS) {
    const debugContr = sdDebugControlPoints(position);
    const debugPoints = sdDebugPoints(position);
    const debugNormals = sdDebugNormals(position);

    if (
      debugNormals < debugPoints && debugNormals < debugContr &&
      debugNormals < poly3D.distance && debugNormals < mainScene
    ) {
      hitInfo.distance = debugNormals;
      hitInfo.objectType = 5; // Debug normals
      return hitInfo;
    }

    if (
      debugPoints < debugContr && debugPoints < poly3D.distance &&
      debugPoints < mainScene
    ) {
      hitInfo.distance = debugPoints;
      hitInfo.objectType = 3; // Debug points
      return hitInfo;
    }

    if (debugContr < poly3D.distance && debugContr < mainScene) {
      hitInfo.distance = debugContr;
      hitInfo.objectType = 4; // Debug control points
      return hitInfo;
    }
  }

  if (poly3D.distance < mainScene) {
    hitInfo.distance = poly3D.distance;
    hitInfo.objectType = 1; // Slider
    hitInfo.segmentIndex = poly3D.closestSegIndex;
    hitInfo.segmentT = poly3D.t;
  } else {
    hitInfo.distance = mainScene;
    hitInfo.objectType = 2; // Main scene
  }
  return hitInfo;
};

const getNormal = (position: d.v3f) => {
  'kernel';
  const epsilon = 0.0001;
  const xOffset = d.vec3f(epsilon, 0, 0);
  const yOffset = d.vec3f(0, epsilon, 0);
  const zOffset = d.vec3f(0, 0, epsilon);
  const normalX = getSceneDist(std.add(position, xOffset)).distance -
    getSceneDist(std.sub(position, xOffset)).distance;
  const normalY = getSceneDist(std.add(position, yOffset)).distance -
    getSceneDist(std.sub(position, yOffset)).distance;
  const normalZ = getSceneDist(std.add(position, zOffset)).distance -
    getSceneDist(std.sub(position, zOffset)).distance;
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
    const distanceToSurface = getSceneDist(samplePosition).distance - AO_BIAS;
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

const BoxIntersection = d.struct({
  hit: d.bool,
  tMin: d.f32,
  tMax: d.f32,
});

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
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST) break;
  }

  if (distanceFromOrigin < MAX_DIST) {
    const pos = std.add(rayOrigin, std.mul(rayDirection, distanceFromOrigin));
    const n = getNormalMain(pos);

    const lightDir = std.mul(lightUniform.$.direction, -1.0);
    const diffuse = std.max(std.dot(n, lightDir), 0.0);
    const viewDir = std.normalize(std.sub(rayOrigin, pos));
    const reflectDir = std.reflect(std.mul(lightDir, -1.0), n);
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
    const lit = std.add(std.add(directionalLight, ambientLight), specular);
    const ao = calculateAO(pos, n);
    return std.mul(lit, ao);
  }
  return d.vec3f(0.0, 0.0, 0.0);
};

const MarchingResult = d.struct({
  color: d.vec4f,
  hitPos: d.vec3f,
});

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'kernel';
  let closestHit = d.f32(MAX_DIST);
  let closestBoxIndex = d.i32(-1);
  const boxCount = boundingBoxesStorage.$.length;

  for (let i = 0; i < boxCount; i++) {
    const bbox = boundingBoxesStorage.$[i];
    const intersection = intersectBox(
      rayOrigin,
      rayDirection,
      bbox.min,
      bbox.max,
    );

    if (intersection.hit && intersection.tMin >= 0.0) {
      closestHit = intersection.tMin;
      closestBoxIndex = i;
      break;
    }
  }

  let distanceFromOrigin = std.max(0.0, closestHit - SURF_DIST);
  const bbox = boundingBoxesStorage.$[closestBoxIndex];
  bboxCenterX.$ = (bbox.min.x + bbox.max.x) * 0.5;
  const intersection = intersectBox(
    rayOrigin,
    rayDirection,
    bbox.min,
    bbox.max,
  );
  const maxMarchDist = intersection.tMax;

  let hitInfo = HitInfo();

  for (let i = 0; i < MAX_STEPS; i++) {
    const currentPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, distanceFromOrigin),
    );

    hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;

    if (distanceFromOrigin > maxMarchDist || hitInfo.distance < SURF_DIST) {
      break;
    }
  }

  if (distanceFromOrigin < maxMarchDist && hitInfo.distance < SURF_DIST) {
    const hitPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, distanceFromOrigin),
    );
    if (DEBUG_GIZMOS) {
      if (hitInfo.objectType === 3) {
        return MarchingResult({
          color: d.vec4f(1, 0, 0, 1), // Debug points in red
          hitPos: hitPosition,
        });
      }
      if (hitInfo.objectType === 4) {
        return MarchingResult({
          color: d.vec4f(0, 1, 0, 1), // Debug control points in green
          hitPos: hitPosition,
        });
      }
      if (hitInfo.objectType === 5) {
        return MarchingResult({
          color: d.vec4f(0, 0, 1, 1), // Debug normals in blue
          hitPos: hitPosition,
        });
      }
    }
    const normal = getNormal(hitPosition);

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
    const litColor = std.add(std.add(directionalLight, ambientLight), specular);

    if (hitInfo.objectType === 1) {
      const N = getNormal(hitPosition);
      const I = rayDirection;
      const cosi = std.min(
        1.0,
        std.max(0.0, std.dot(std.mul(I, -1.0), N)),
      );
      const F = fresnelSchlick(cosi, 1.0, JELLY_IOR);

      // Reflection
      const reflDir = std.reflect(I, N);
      const reflOrigin = std.add(hitPosition, std.mul(N, SURF_DIST * 2.0));
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
          const dIn = sliderSdf3D(p).distance;
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

      return MarchingResult({
        color: d.vec4f(jelly, 1.0),
        hitPos: hitPosition,
      });
    }

    const ao = calculateAO(hitPosition, normal);
    const finalColor = std.mul(litColor, ao);

    return MarchingResult({
      color: d.vec4f(finalColor, 1.0),
      hitPos: hitPosition,
    });
  }
  return MarchingResult({
    color: d.vec4f(),
    hitPos: d.vec3f(),
  });
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

  const clipPos = d.vec4f(u, v, -1.0, 1.0);

  const invView = cameraUniform.$.viewInv;
  const invProj = cameraUniform.$.projInv;

  const viewPos = std.mul(invProj, clipPos);
  const viewPosNormalized = d.vec4f(viewPos.xyz.div(viewPos.w), 1.0);

  const worldPos = std.mul(invView, viewPosNormalized);

  const rayOrigin = invView.columns[3].xyz;

  const rayDir = std.normalize(std.sub(worldPos.xyz, rayOrigin));

  const hitInfo = rayMarch(rayOrigin, rayDir);

  let depth = d.f32(1.0);

  // Check if we have a valid hit by looking at the alpha channel of the color (should always be the case)
  if (hitInfo.color.w > 0.0) {
    const viewSpacePos = std.mul(
      cameraUniform.$.view,
      d.vec4f(hitInfo.hitPos, 1.0),
    );
    const nearPlane = 0.1;
    const farPlane = d.f32(10);
    const linearDepth = -viewSpacePos.z;
    depth = (linearDepth - nearPlane) / (farPlane - nearPlane);
    depth = std.saturate(depth);
  }

  std.textureStore(
    rayMarchLayout.$.currentDepth,
    d.vec2u(gid.x, gid.y),
    d.vec4f(depth, 0, 0, 0),
  );

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

  // First pass: Ray march to current texture
  computePipeline.with(
    rayMarchLayout,
    root.createBindGroup(rayMarchLayout, {
      currentTexture: textures[currentFrame].write,
      currentDepth: textures[currentFrame].depth,
    }),
  ).dispatchWorkgroups(
    Math.ceil(width / 16),
    Math.ceil(height / 16),
  );

  // Second pass: TAA resolve
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

  // Final pass: Render resolved result to screen
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
