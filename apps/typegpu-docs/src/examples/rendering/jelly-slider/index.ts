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
const bezierTexture = slider.bezierTexture.createView();
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
    }).$usage('storage', 'sampled', 'render');

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

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const backgroundDistLayout = tgpu.bindGroupLayout({
  distanceTexture: {
    storageTexture: d.textureStorage2d('r32float', 'write-only'),
  },
});

const rayMarchLayout = tgpu.bindGroupLayout({
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

const ObjectType = {
  SLIDER: 1,
  BACKGROUND: 2,
} as const;

const HitInfo = d.struct({
  distance: d.f32,
  objectType: d.i32,
  t: d.f32,
});

const LineInfo = d.struct({
  t: d.f32,
  distance: d.f32,
  capIndicator: d.f32,
});

const BoxIntersection = d.struct({
  hit: d.bool,
  tMin: d.f32,
  tMax: d.f32,
});

const sdInflatedPolyline2D = (p: d.v2f) => {
  'use gpu';
  const left = d.f32(bezierBbox[3]);
  const right = d.f32(bezierBbox[1]);
  const bottom = d.f32(bezierBbox[2]);
  const top = d.f32(bezierBbox[0]);

  const uv = d.vec2f(
    (p.x - left) / (right - left),
    (top - p.y) / (top - bottom),
  );
  const clampedUV = std.saturate(uv);

  const sampledColor = std.textureSampleLevel(
    bezierTexture.$,
    filteringSampler.$,
    clampedUV,
    0,
  );
  const segUnsigned = sampledColor.x;
  const capIndicator = sampledColor.y;
  const progress = sampledColor.z;

  return LineInfo({
    t: progress,
    distance: segUnsigned,
    capIndicator: capIndicator,
  });
};

const sliderSdf3D = (position: d.v3f) => {
  'use gpu';
  const poly2D = sdInflatedPolyline2D(position.xy);

  let finalDist = d.f32(0.0);
  if (poly2D.capIndicator > 0.5) {
    const endCap = slider.endCapUniform.$;
    const secondLastPoint = d.vec2f(endCap.x, endCap.y);
    const lastPoint = d.vec2f(endCap.z, endCap.w);

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

    finalDist = extrudeEnd;
  } else {
    const body = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) -
      LINE_RADIUS;
    finalDist = body;
  }

  return LineInfo({
    t: poly2D.t,
    distance: finalDist,
    capIndicator: poly2D.capIndicator,
  });
};

const getMainSceneDist = (position: d.v3f) => {
  'use gpu';
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
  'use gpu';
  const left = d.f32(bezierBbox[3]);
  const right = d.f32(bezierBbox[1]);
  const bottom = d.f32(bezierBbox[2]);
  const top = d.f32(bezierBbox[0]);

  const p = position.xy;
  if (p.x < left || p.x > right || p.y < bottom || p.y > top) {
    return 1e9;
  }

  const poly2D = sdInflatedPolyline2D(p);
  const dist3D = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) -
    LINE_RADIUS;

  return dist3D;
};

const getSceneDist = (position: d.v3f) => {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const poly3D = sliderSdf3D(position);

  const hitInfo = HitInfo();

  if (poly3D.distance < mainScene) {
    hitInfo.distance = poly3D.distance;
    hitInfo.objectType = ObjectType.SLIDER;
    hitInfo.t = poly3D.t;
  } else {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.BACKGROUND;
  }
  return hitInfo;
};

const getSceneDistForAO = (position: d.v3f) => {
  'use gpu';
  const mainScene = getMainSceneDist(position);
  const sliderApprox = sliderApproxDist(position);
  return std.min(mainScene, sliderApprox);
};

const getNormal = (position: d.v3f) => {
  'use gpu';
  const epsilon = 0.01;
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
  'use gpu';
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
  'use gpu';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (let i = 1; i <= AO_STEPS; i++) {
    const sampleHeight = stepDistance * d.f32(i);
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
  'use gpu';
  const r0 = std.pow((ior1 - ior2) / (ior1 + ior2), 2.0);
  return r0 + (1.0 - r0) * std.pow(1.0 - cosTheta, 5.0);
};

const beerLambert = (sigma: d.v3f, dist: number) => {
  'use gpu';
  return std.exp(std.mul(sigma, -dist));
};

const calculateLighting = (
  hitPosition: d.v3f,
  normal: d.v3f,
  rayOrigin: d.v3f,
) => {
  'use gpu';
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
  'use gpu';
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
  'use gpu';
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
  'use gpu';
  let totalSteps = d.u32();

  const backgroundHitDist = std.textureLoad(
    rayMarchLayout.$.backgroundDistTexture,
    pixelCoord,
  ).x;

  const left = d.f32(bezierBbox[3]);
  const right = d.f32(bezierBbox[1]);
  const bottom = d.f32(bezierBbox[2]);
  const top = d.f32(bezierBbox[0]);
  const zDepth = d.f32(0.18);

  const sliderMin = d.vec3f(left, bottom, -zDepth);
  const sliderMax = d.vec3f(right, top, zDepth);

  const intersection = intersectBox(
    rayOrigin,
    rayDirection,
    sliderMin,
    sliderMax,
  );

  if (!intersection.hit || backgroundHitDist < intersection.tMin) {
    const hitPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, backgroundHitDist),
    );
    const normal = getNormalMain(hitPosition);
    const litColor = calculateLighting(hitPosition, normal, rayOrigin);
    const ao = calculateAO(hitPosition, normal);
    const finalColor = std.mul(litColor, ao);

    return d.vec4f(finalColor, 1.0);
  }

  let distanceFromOrigin = std.max(d.f32(0.0), intersection.tMin);
  const maxMarchDist = backgroundHitDist;

  for (let i = 0; i < MAX_STEPS; i++) {
    if (totalSteps >= MAX_STEPS) {
      break;
    }

    const currentPosition = std.add(
      rayOrigin,
      std.mul(rayDirection, distanceFromOrigin),
    );

    const hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;
    totalSteps++;

    if (hitInfo.distance < SURF_DIST) {
      const hitPosition = std.add(
        rayOrigin,
        std.mul(rayDirection, distanceFromOrigin),
      );
      const normal = getNormal(hitPosition);
      const lightDir = std.mul(lightUniform.$.direction, -1.0);
      const litColor = calculateLighting(hitPosition, normal, rayOrigin);

      if (!(hitInfo.objectType === ObjectType.SLIDER)) {
        // we hit the background
        const ao = calculateAO(hitPosition, normal);
        const finalColor = std.mul(litColor, ao);

        return d.vec4f(finalColor, 1.0);
      }

      const N = getNormal(hitPosition);
      const I = rayDirection;
      const cosi = std.min(
        1.0,
        std.max(0.0, std.dot(std.mul(I, -1.0), N)),
      );
      const F = fresnelSchlick(cosi, d.f32(1.0), d.f32(JELLY_IOR));

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
          const dIn = sliderSdf3D(p).distance;
          const step = std.max(SURF_DIST, std.abs(dIn));
          p = std.add(p, std.mul(refrDir, step));
          insideLen += step;
          if (dIn >= 0.0) break; // exited
        }
        const exitPos = std.add(p, std.mul(refrDir, SURF_DIST * 2.0));
        const env = rayMarchNoJelly(exitPos, refrDir);

        const progress = hitInfo.t;

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

      return d.vec4f(jelly, 1.0);
    }

    if (distanceFromOrigin > maxMarchDist) {
      break;
    }
  }

  // If we didn't hit jelly but we hit the background, render it properly
  const hitPosition = std.add(
    rayOrigin,
    std.mul(rayDirection, backgroundHitDist),
  );
  const normal = getNormalMain(hitPosition);
  const litColor = calculateLighting(hitPosition, normal, rayOrigin);
  const ao = calculateAO(hitPosition, normal);
  const finalColor = std.mul(litColor, ao);

  return d.vec4f(finalColor, 1.0);
};

const raymarchFn = tgpu['~unstable'].fragmentFn({
  in: {
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ uv }) => {
  const dimensions = std.textureDimensions(
    rayMarchLayout.$.backgroundDistTexture,
  );
  randf.seed2(uv);

  const clipPos = d.vec4f(uv.x * 2 - 1, -(uv.y * 2 - 1), -1.0, 1.0);

  const invView = cameraUniform.$.viewInv;
  const invProj = cameraUniform.$.projInv;

  const viewPos = std.mul(invProj, clipPos);
  const viewPosNormalized = d.vec4f(viewPos.xyz.div(viewPos.w), 1.0);

  const worldPos = std.mul(invView, viewPosNormalized);

  const rayOrigin = invView.columns[3].xyz;
  const rayDir = std.normalize(std.sub(worldPos.xyz, rayOrigin));

  return rayMarch(
    rayOrigin,
    rayDir,
    d.vec2u(uv.mul(d.vec2f(dimensions))),
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
    filteringSampler.$,
    input.uv,
  );
});

const backgroundDistPipeline = root['~unstable']
  .withCompute(backgroundDistFn)
  .createPipeline()
  .withPerformanceCallback((start, end) => {
    const elapsed = Number(end - start) / 1e6;
    console.log(`Background dist time: ${elapsed.toFixed(2)} ms`);
  });

const rayMarchPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(raymarchFn, { format: 'rgba8unorm' })
  .createPipeline()
  .withPerformanceCallback((start, end) => {
    const elapsed = Number(end - start) / 1e6;
    console.log(`Raymarch time: ${elapsed.toFixed(2)} ms`);
  });

const taaResolvePipeline = root['~unstable']
  .withCompute(taaResolveFn)
  .createPipeline()
  .withPerformanceCallback((start, end) => {
    const elapsed = Number(end - start) / 1e6;
    console.log(`TAA resolve time: ${elapsed.toFixed(2)} ms`);
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

  backgroundDistPipeline.with(
    root.createBindGroup(backgroundDistLayout, {
      distanceTexture: backgroundDistTexture.write,
    }),
  ).dispatchWorkgroups(
    Math.ceil(width / 16),
    Math.ceil(height / 16),
  );

  rayMarchPipeline.with(
    root.createBindGroup(rayMarchLayout, {
      backgroundDistTexture: backgroundDistTexture.read,
    }),
  ).withColorAttachment({
    view: root.unwrap(textures[currentFrame].sampled),
    loadOp: 'clear',
    storeOp: 'store',
  }).draw(3);

  taaResolvePipeline.with(
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

function handleResize() {
  [width, height] = [
    canvas.width * qualityScale,
    canvas.height * qualityScale,
  ];
  camera.updateProjection(Math.PI / 4, width, height);
  textures = createTextures();
  backgroundDistTexture = createBackgroundDistTexture();
  resolvedTextures = createResolvedTextures();
  frameCount = 0;
}

const resizeObserver = new ResizeObserver(() => {
  handleResize();
});
resizeObserver.observe(canvas);

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
        'Ultra': 4.0,
      };

      qualityScale = qualityMap[value] || 0.5;
      handleResize();
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
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
