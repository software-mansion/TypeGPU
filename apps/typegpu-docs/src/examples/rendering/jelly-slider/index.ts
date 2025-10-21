import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';

import { randf } from '@typegpu/noise';
import { Slider } from './slider.ts';
import { CameraController } from './camera.ts';
import { EventHandler } from './events.ts';
import {
  backgroundDistLayout,
  DirectionalLight,
  HitInfo,
  LineInfo,
  ObjectType,
  Ray,
  rayMarchLayout,
  sampleLayout,
  SdfBbox,
} from './dataTypes.ts';
import {
  beerLambert,
  createBackgroundDistTexture,
  createTextures,
  fresnelSchlick,
  fullScreenTriangle,
  intersectBox,
} from './utils.ts';
import { TAAResolver } from './taa.ts';
import {
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
  AO_BIAS,
  AO_INTENSITY,
  AO_RADIUS,
  AO_STEPS,
  JELLY_IOR,
  JELLY_SCATTER_STRENGTH,
  LINE_HALF_THICK,
  LINE_RADIUS,
  MAX_DIST,
  MAX_INTERNAL_STEPS,
  MAX_STEPS,
  SPECULAR_INTENSITY,
  SPECULAR_POWER,
  SURF_DIST,
} from './constants.ts';
import { NumberProvider } from './numbers.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');
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

const digitsProvider = new NumberProvider(root);
const digitsTextureView = digitsProvider.digitTextureAtlas.createView(
  d.texture2dArray(d.f32),
);

let qualityScale = 0.5;
let [width, height] = [
  canvas.width * qualityScale,
  canvas.height * qualityScale,
];

let textures = createTextures(root, width, height);
let backgroundDistTexture = createBackgroundDistTexture(root, width, height);

const filteringSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
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

const lightUniform = root.createUniform(DirectionalLight, {
  direction: std.normalize(d.vec3f(0.19, -0.24, 0.75)),
  color: d.vec3f(1, 1, 1),
});

const jellyColorUniform = root.createUniform(
  d.vec4f,
  d.vec4f(1.0, 0.45, 0.075, 1.0),
);

const getRay = (ndc: d.v2f) => {
  'use gpu';
  const clipPos = d.vec4f(ndc.x, ndc.y, -1.0, 1.0);

  const invView = cameraUniform.$.viewInv;
  const invProj = cameraUniform.$.projInv;

  const viewPos = std.mul(invProj, clipPos);
  const viewPosNormalized = d.vec4f(viewPos.xyz.div(viewPos.w), 1.0);

  const worldPos = std.mul(invView, viewPosNormalized);

  const rayOrigin = invView.columns[3].xyz;
  const rayDir = std.normalize(std.sub(worldPos.xyz, rayOrigin));

  return Ray({
    origin: rayOrigin,
    direction: rayDir,
  });
};

const getSliderBbox = () => {
  'use gpu';
  return SdfBbox({
    left: d.f32(bezierBbox[3]),
    right: d.f32(bezierBbox[1]),
    bottom: d.f32(bezierBbox[2]),
    top: d.f32(bezierBbox[0]),
  });
};

const sdInflatedPolyline2D = (p: d.v2f) => {
  'use gpu';
  const bbox = getSliderBbox();

  const uv = d.vec2f(
    (p.x - bbox.left) / (bbox.right - bbox.left),
    (bbox.top - p.y) / (bbox.top - bbox.bottom),
  );
  const clampedUV = std.saturate(uv);

  const sampledColor = std.textureSampleLevel(
    bezierTexture.$,
    filteringSampler.$,
    clampedUV,
    0,
  );
  const segUnsigned = sampledColor.x;
  const progress = sampledColor.y;
  const normal = sampledColor.zw;

  return LineInfo({
    t: progress,
    distance: segUnsigned,
    normal: normal,
  });
};

const cap3D = (position: d.v3f) => {
  'use gpu';
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
  return extrudeEnd;
};

const sliderSdf3D = (position: d.v3f) => {
  'use gpu';
  const poly2D = sdInflatedPolyline2D(position.xy);

  let finalDist = d.f32(0.0);
  if (poly2D.t > 0.94) {
    finalDist = cap3D(position);
  } else {
    const body = sdf.opExtrudeZ(position, poly2D.distance, LINE_HALF_THICK) -
      LINE_RADIUS;
    finalDist = body;
  }

  return LineInfo({
    t: poly2D.t,
    distance: finalDist,
    normal: poly2D.normal,
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
  const bbox = getSliderBbox();

  const p = position.xy;
  if (
    p.x < bbox.left || p.x > bbox.right || p.y < bbox.bottom || p.y > bbox.top
  ) {
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

const sdfSlot = tgpu.slot<(pos: d.v3f) => number>();

const getNormalFromSdf = tgpu.fn([d.vec3f, d.f32], d.vec3f)(
  (position, epsilon) => {
    'use gpu';
    const xOffset = d.vec3f(epsilon, 0, 0);
    const yOffset = d.vec3f(0, epsilon, 0);
    const zOffset = d.vec3f(0, 0, epsilon);

    const normalX = sdfSlot.$(position.add(xOffset)) -
      sdfSlot.$(position.sub(xOffset));
    const normalY = sdfSlot.$(position.add(yOffset)) -
      sdfSlot.$(position.sub(yOffset));
    const normalZ = sdfSlot.$(position.add(zOffset)) -
      sdfSlot.$(position.sub(zOffset));

    return std.normalize(d.vec3f(normalX, normalY, normalZ));
  },
);

const getNormalCapSdf = getNormalFromSdf.with(sdfSlot, cap3D);
const getNormalMainSdf = getNormalFromSdf.with(sdfSlot, getMainSceneDist);

const getNormalCap = (pos: d.v3f) => {
  'use gpu';
  return getNormalCapSdf(pos, 0.01);
};

const getNormalMain = (position: d.v3f) => {
  'use gpu';
  if (
    std.abs(position.z) > 0.22 || std.abs(position.x) > 1.02 ||
    (std.abs(position.x) < 0.9 && std.abs(position.z) < 0.17)
  ) {
    return d.vec3f(0, 1, 0);
  }
  return getNormalMainSdf(position, 0.0001);
};

const getSliderNormal = (
  position: d.v3f,
  hitInfo: d.Infer<typeof HitInfo>,
) => {
  'use gpu';
  const poly2D = sdInflatedPolyline2D(position.xy);
  const gradient2D = poly2D.normal;

  const threshold = LINE_HALF_THICK * 0.85;
  const absZ = std.abs(position.z);
  const zDistance = std.max(
    0,
    (absZ - threshold) * LINE_HALF_THICK / (LINE_HALF_THICK - threshold),
  );
  const edgeDistance = LINE_RADIUS - poly2D.distance;

  const edgeContrib = 0.9;
  const zContrib = 1.0 - edgeContrib;

  const zDirection = std.sign(position.z);
  const zAxisVector = d.vec3f(0, 0, zDirection);

  const edgeBlendDistance = edgeContrib * LINE_RADIUS +
    zContrib * LINE_HALF_THICK;

  const blendFactor = std.smoothstep(
    edgeBlendDistance,
    0.0,
    zDistance * zContrib + edgeDistance * edgeContrib,
  );

  const normal2D = d.vec3f(gradient2D.xy, 0);
  const blendedNormal = std.mix(
    zAxisVector,
    normal2D,
    blendFactor * 0.5 + 0.5,
  );

  let normal = std.normalize(blendedNormal);

  if (hitInfo.t > 0.94) {
    const ratio = (hitInfo.t - 0.94) / 0.02;
    const fullNormal = getNormalCap(position);
    normal = std.normalize(std.mix(normal, fullNormal, ratio));
  }

  return normal;
};

const getNormal = (
  position: d.v3f,
  hitInfo: d.Infer<typeof HitInfo>,
) => {
  'use gpu';
  if (hitInfo.objectType === ObjectType.SLIDER && hitInfo.t < 0.96) {
    return getSliderNormal(position, hitInfo);
  }

  return std.select(
    getNormalCap(position),
    getNormalMain(position),
    hitInfo.objectType === ObjectType.BACKGROUND,
  );
};

const getShadow = (position: d.v3f, normal: d.v3f, lightDir: d.v3f) => {
  'use gpu';
  const newDir = std.normalize(lightDir);

  const bias = 0.004;
  const newOrigin = position.add(normal.mul(bias));

  const bbox = getSliderBbox();
  const zDepth = d.f32(0.21);

  const sliderMin = d.vec3f(bbox.left, bbox.bottom, -zDepth);
  const sliderMax = d.vec3f(bbox.right, bbox.top, zDepth);

  const intersection = intersectBox(
    newOrigin,
    newDir,
    sliderMin,
    sliderMax,
  );

  if (intersection.hit) {
    let t = std.max(0.0, intersection.tMin);
    const maxT = intersection.tMax;

    for (let i = 0; i < MAX_STEPS; i++) {
      const currPos = newOrigin.add(newDir.mul(t));
      const hitInfo = getSceneDist(currPos);

      if (hitInfo.distance < SURF_DIST) {
        return std.select(
          0.8,
          0.3,
          hitInfo.objectType === ObjectType.SLIDER,
        );
      }

      t += hitInfo.distance;
      if (t > maxT) {
        break;
      }
    }
  }

  return d.f32(0);
};

const calculateAO = (position: d.v3f, normal: d.v3f) => {
  'use gpu';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (let i = 1; i <= AO_STEPS; i++) {
    const sampleHeight = stepDistance * d.f32(i);
    const samplePosition = position.add(normal.mul(sampleHeight));
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

const calculateLighting = (
  hitPosition: d.v3f,
  normal: d.v3f,
  rayOrigin: d.v3f,
) => {
  'use gpu';
  const lightDir = std.neg(lightUniform.$.direction);

  const shadow = getShadow(hitPosition, normal, lightDir);
  const visibility = 1.0 - shadow;

  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(rayOrigin.sub(hitPosition));
  const reflectDir = std.reflect(std.neg(lightDir), normal);
  const specularFactor = std.max(std.dot(viewDir, reflectDir), 0) **
    SPECULAR_POWER;
  const specular = lightUniform.$.color.mul(
    specularFactor * SPECULAR_INTENSITY,
  );

  const baseColor = d.vec3f(0.9);

  const directionalLight = baseColor
    .mul(lightUniform.$.color)
    .mul(diffuse * visibility);
  const ambientLight = baseColor.mul(AMBIENT_COLOR).mul(AMBIENT_INTENSITY);

  const finalSpecular = specular.mul(visibility);

  return std.saturate(directionalLight.add(ambientLight).add(finalSpecular));
};

const applyAO = (
  litColor: d.v3f,
  hitPosition: d.v3f,
  normal: d.v3f,
) => {
  'use gpu';
  const ao = calculateAO(hitPosition, normal);
  const finalColor = litColor.mul(ao);
  return d.vec4f(finalColor, 1.0);
};

const rayMarchNoJelly = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'use gpu';
  let distanceFromOrigin = d.f32();
  let hit = d.f32();

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = rayOrigin.add(rayDirection.mul(distanceFromOrigin));
    hit = getMainSceneDist(p);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST) {
      break;
    }
  }

  if (distanceFromOrigin < MAX_DIST) {
    return renderBackground(rayOrigin, rayDirection, distanceFromOrigin).xyz;
  }
  return d.vec3f();
};

const renderPercentageOnGround = (
  hitPosition: d.v3f,
  center: d.v3f,
  percentage: number,
) => {
  'use gpu';

  const textWidth = 0.3;
  const textHeight = 0.38;

  if (
    std.abs(hitPosition.x - center.x) > textWidth * 0.5 ||
    std.abs(hitPosition.z - center.z) > textHeight * 0.5
  ) {
    return d.vec4f();
  }

  const localX = hitPosition.x - center.x;
  const localZ = hitPosition.z - center.z;

  const uvX = (localX + textWidth * 0.5) / textWidth;
  const uvZ = (localZ + textHeight * 0.5) / textHeight;

  if (uvX < 0.0 || uvX > 1.0 || uvZ < 0.0 || uvZ > 1.0) {
    return d.vec4f();
  }

  return std.textureSampleLevel(
    digitsTextureView.$,
    filteringSampler.$,
    d.vec2f(uvX, uvZ),
    percentage,
    0,
  );
};

const renderBackground = (
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  backgroundHitDist: number,
) => {
  'use gpu';
  const hitPosition = rayOrigin.add(rayDirection.mul(backgroundHitDist));

  const percentageSample = renderPercentageOnGround(
    hitPosition,
    d.vec3f(0.75, 0.0, 0.0),
    d.u32((slider.endCapUniform.$.x + 0.43) * 84),
  );

  let highlights = d.f32(0.0);

  const highlightWidth = d.f32(1.1 + slider.endCapUniform.$.x / 2);
  const highlightHeight = d.f32(0.5 + (1 - slider.endCapUniform.$.x) / 3);
  let offsetX = d.f32((1.1 - slider.endCapUniform.$.x) / 2);
  let offsetZ = d.f32();

  const lightDir = lightUniform.$.direction;
  const causticScale = 0.1;
  offsetX += lightDir.x * causticScale;
  offsetZ += lightDir.z * causticScale;

  if (
    std.abs(hitPosition.x + offsetX) < highlightWidth &&
    std.abs(hitPosition.z + offsetZ) < highlightHeight
  ) {
    const uvX_orig = (hitPosition.x + offsetX + highlightWidth * 0.5) /
      highlightWidth;
    const uvZ_orig = (hitPosition.z + offsetZ + highlightHeight * 0.5) /
      highlightHeight;

    const lightDir = lightUniform.$.direction;
    const angle = std.atan2(lightDir.z, lightDir.x) + 1.5708;
    const cos_a = std.cos(angle);
    const sin_a = std.sin(angle);
    const rot = d.mat2x2f(cos_a, -sin_a, sin_a, cos_a);

    const centeredUV = d.vec2f(uvX_orig - 0.5, uvZ_orig - 0.5);
    const rotatedUV = rot.mul(centeredUV);
    const finalUV = rotatedUV.add(d.vec2f(0.5));

    const density = 1 - std.textureSampleLevel(
      bezierTexture.$,
      filteringSampler.$,
      finalUV,
      0,
    ).x;

    const fadeX = 1.0 - std.abs(finalUV.x - 0.5) * 2.0;
    const fadeZ = 1.0 - std.abs(finalUV.y - 0.5) * 2.0;
    const edgeFade = std.saturate(fadeX) * std.saturate(fadeZ);

    highlights = density ** 4 * edgeFade * 2 * (1.2 - slider.endCapUniform.$.x);
  }

  const normal = getNormalMain(hitPosition);
  const litColor = calculateLighting(hitPosition, normal, rayOrigin);
  const backgroundColor = applyAO(litColor, hitPosition, normal);

  const textColor = std.saturate(litColor.mul(d.vec3f(1.3)));

  return d.vec4f(
    std.mix(backgroundColor.xyz, textColor, percentageSample.x).mul(
      1.0 + highlights,
    ),
    1.0,
  );
};

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f, pixelCoord: d.v2u) => {
  'use gpu';
  let totalSteps = d.u32();

  const backgroundHitDist = std.textureLoad(
    rayMarchLayout.$.backgroundDistTexture,
    pixelCoord,
  ).x;

  const bbox = getSliderBbox();
  const zDepth = d.f32(0.25);

  const sliderMin = d.vec3f(bbox.left, bbox.bottom, -zDepth);
  const sliderMax = d.vec3f(bbox.right, bbox.top, zDepth);

  const intersection = intersectBox(
    rayOrigin,
    rayDirection,
    sliderMin,
    sliderMax,
  );

  if (!intersection.hit || backgroundHitDist < intersection.tMin) {
    return renderBackground(rayOrigin, rayDirection, backgroundHitDist);
  }

  let distanceFromOrigin = std.max(d.f32(0.0), intersection.tMin);
  const maxMarchDist = backgroundHitDist;

  for (let i = 0; i < MAX_STEPS; i++) {
    if (totalSteps >= MAX_STEPS) {
      break;
    }

    const currentPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

    const hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;
    totalSteps++;

    if (hitInfo.distance < SURF_DIST) {
      const hitPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

      if (!(hitInfo.objectType === ObjectType.SLIDER)) {
        break;
      }

      const N = getNormal(hitPosition, hitInfo);
      const I = rayDirection;
      const cosi = std.min(
        1.0,
        std.max(0.0, std.dot(std.neg(I), N)),
      );
      const F = fresnelSchlick(cosi, d.f32(1.0), d.f32(JELLY_IOR));

      const reflDir = std.reflect(I, N);
      const reflOrigin = hitPosition.add(N.mul(SURF_DIST * 2.0));
      const reflection = rayMarchNoJelly(reflOrigin, reflDir);

      const eta = 1.0 / JELLY_IOR;
      const k = 1.0 - eta * eta * (1.0 - cosi * cosi);
      let refractedColor = d.vec3f(0.0, 0.0, 0.0);
      if (k > 0.0) {
        const refrDir = std.normalize(
          std.add(
            I.mul(eta),
            N.mul(eta * cosi - std.sqrt(k)),
          ),
        );
        let p = hitPosition.add(refrDir.mul(SURF_DIST * 2.0));
        let insideLen = d.f32();
        for (let i = 0; i < MAX_INTERNAL_STEPS; i++) {
          const dIn = sliderSdf3D(p).distance;
          const step = std.max(SURF_DIST, std.abs(dIn));
          p = p.add(refrDir.mul(step));
          insideLen += step;
          if (dIn >= 0.0) break;
        }
        const exitPos = p.add(refrDir.mul(SURF_DIST * 2.0));
        const env = rayMarchNoJelly(exitPos, refrDir);

        const progress = hitInfo.t;

        const jellyColor = jellyColorUniform.$;

        const scatterTint = jellyColor.xyz.mul(1.5);
        const density = d.f32(20.0);
        const absorb = d.vec3f(1.0).sub(jellyColor.xyz).mul(density);

        const T = beerLambert(absorb.mul(progress ** 2), insideLen);

        const lightDir = std.neg(lightUniform.$.direction);

        const forward = std.max(0.0, std.dot(lightDir, refrDir));
        const scatter = scatterTint.mul(
          JELLY_SCATTER_STRENGTH * forward * progress,
        );
        refractedColor = env.mul(T).add(scatter);
      }

      const jelly = std.add(
        reflection.mul(F),
        refractedColor.mul(1 - F),
      );

      return d.vec4f(jelly, 1.0);
    }

    if (distanceFromOrigin > maxMarchDist) {
      break;
    }
  }

  return renderBackground(rayOrigin, rayDirection, backgroundHitDist);
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
  const ray = getRay(d.vec2f(u, v));

  let tempDist = d.f32();
  let backgroundHitDist = d.f32(MAX_DIST);

  for (let i = 0; i < MAX_STEPS; i++) {
    const p = ray.origin.add(ray.direction.mul(tempDist));
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

  const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
  const ray = getRay(ndc);

  return rayMarch(
    ray.origin,
    ray.direction,
    d.vec2u(uv.mul(d.vec2f(dimensions))),
  );
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
  .createPipeline();

const rayMarchPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(raymarchFn, { format: 'rgba8unorm' })
  .createPipeline();

const renderPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(fragmentMain, { format: presentationFormat })
  .createPipeline();

const eventHandler = new EventHandler(canvas);
let lastTimeStamp = performance.now();
let frameCount = 0;
const taaResolver = new TAAResolver(root, width, height);

function createBindGroups() {
  return {
    backgroundDist: root.createBindGroup(backgroundDistLayout, {
      distanceTexture: backgroundDistTexture.write,
    }),
    rayMarch: root.createBindGroup(rayMarchLayout, {
      backgroundDistTexture: backgroundDistTexture.read,
    }),
    render: [0, 1].map((frame) =>
      root.createBindGroup(sampleLayout, {
        currentTexture: taaResolver.getResolvedTexture(frame),
      })
    ),
  };
}

let bindGroups = createBindGroups();

function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  eventHandler.update();
  slider.setDragX(eventHandler.currentMouseX);
  slider.update(deltaTime);

  const currentFrame = frameCount % 2;

  backgroundDistPipeline.with(bindGroups.backgroundDist).dispatchWorkgroups(
    Math.ceil(width / 16),
    Math.ceil(height / 16),
  );

  rayMarchPipeline.with(bindGroups.rayMarch).withColorAttachment({
    view: root.unwrap(textures[currentFrame].sampled),
    loadOp: 'clear',
    storeOp: 'store',
  }).draw(3);

  taaResolver.resolve(
    textures[currentFrame].sampled,
    frameCount,
    currentFrame,
  );

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(bindGroups.render[currentFrame])
    .draw(3);

  requestAnimationFrame(render);
}

function handleResize() {
  [width, height] = [
    canvas.width * qualityScale,
    canvas.height * qualityScale,
  ];
  camera.updateProjection(Math.PI / 4, width, height);
  textures = createTextures(root, width, height);
  backgroundDistTexture = createBackgroundDistTexture(root, width, height);
  taaResolver.resize(width, height);
  frameCount = 0;

  bindGroups = createBindGroups();
}

const resizeObserver = new ResizeObserver(() => {
  handleResize();
});
resizeObserver.observe(canvas);

requestAnimationFrame(render);

// #region Example controls and cleanup

async function autoSetQuaility() {
  if (!hasTimestampQuery) {
    return 0.5;
  }

  const targetFrameTime = 16.0;
  const tolerance = 2.0;
  let resolutionScale = 0.3;
  let lastTimeMs = 0;

  const measurePipeline = rayMarchPipeline
    .withPerformanceCallback((start, end) => {
      lastTimeMs = Number(end - start) / 1e6;
    });

  for (let i = 0; i < 8; i++) {
    const testTexture = root['~unstable'].createTexture({
      size: [canvas.width * resolutionScale, canvas.height * resolutionScale],
      format: 'rgba8unorm',
    }).$usage('render');

    measurePipeline
      .withColorAttachment({
        view: root.unwrap(testTexture).createView(),
        loadOp: 'clear',
        storeOp: 'store',
      })
      .with(
        root.createBindGroup(rayMarchLayout, {
          backgroundDistTexture: backgroundDistTexture.read,
        }),
      )
      .draw(3);

    await root.device.queue.onSubmittedWorkDone();
    testTexture.destroy();

    if (Math.abs(lastTimeMs - targetFrameTime) < tolerance) {
      break;
    }

    const adjustment = lastTimeMs > targetFrameTime ? -0.1 : 0.1;
    resolutionScale = Math.max(
      0.3,
      Math.min(1.0, resolutionScale + adjustment),
    );
  }

  console.log(`Auto-selected quality scale: ${resolutionScale.toFixed(2)}`);
  return resolutionScale;
}

export const controls = {
  'Quality': {
    initial: 'Auto',
    options: [
      'Auto',
      'Very Low',
      'Low',
      'Medium',
      'High',
      'Ultra',
    ],
    onSelectChange: (value: string) => {
      if (value === 'Auto') {
        autoSetQuaility().then((scale) => {
          qualityScale = scale;
          handleResize();
        });
        return;
      }

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
  'Jelly Color': {
    initial: [1.0, 0.45, 0.075],
    onColorChange: (c: [number, number, number]) => {
      jellyColorUniform.write(d.vec4f(...c, 1.0));
    },
  },
};

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
