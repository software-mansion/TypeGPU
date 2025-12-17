import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { perlin3d, randf } from '@typegpu/noise';
import {
  cameraUniformSlot,
  darkModeUniformSlot,
  effectTimeUniformSlot,
  jellyColorUniformSlot,
  knobBehaviorSlot,
  lightUniformSlot,
  ObjectType,
  randomUniformSlot,
  Ray,
  RayMarchResult,
} from './dataTypes.ts';
import {
  getJellyBounds,
  getSceneDist,
  sdBackground,
  sdFloorCutout,
  sdJelly,
  sdMeter,
} from './sdfs.ts';
import {
  AMBIENT_COLOR,
  AMBIENT_INTENSITY,
  AO_BIAS,
  AO_INTENSITY,
  AO_RADIUS,
  AO_STEPS,
  DARK_GROUND_ALBEDO,
  GroundParams,
  JELLY_IOR,
  JELLY_SCATTER_STRENGTH,
  LIGHT_GROUND_ALBEDO,
  MAX_DIST,
  MAX_STEPS,
  METER_TICKS,
  SPECULAR_INTENSITY,
  SPECULAR_POWER,
  SURF_DIST,
} from './constants.ts';
import { beerLambert, fresnelSchlick, intersectBox, rotateY } from './utils.ts';
import { sdCapsule } from '@typegpu/sdf';

const getRay = (ndc: d.v2f) => {
  'use gpu';
  const clipPos = d.vec4f(ndc.x, ndc.y, -1.0, 1.0);

  const invView = cameraUniformSlot.$.viewInv;
  const invProj = cameraUniformSlot.$.projInv;

  const viewPos = invProj.mul(clipPos);
  const viewPosNormalized = d.vec4f(viewPos.xyz.div(viewPos.w), 1.0);

  const worldPos = invView.mul(viewPosNormalized);

  const rayOrigin = invView.columns[3].xyz;
  const rayDir = std.normalize(worldPos.xyz.sub(rayOrigin));

  return Ray({
    origin: rayOrigin,
    direction: rayDir,
  });
};

const getSceneDistForAO = (position: d.v3f) => {
  'use gpu';
  const mainScene = sdBackground(position);
  const jelly = sdJelly(position);
  return std.min(mainScene, jelly);
};

const getApproxNormal = (position: d.v3f, epsilon: number): d.v3f => {
  'use gpu';
  const k = d.vec3f(1, -1, 0);

  const offset1 = k.xyy.mul(epsilon);
  const offset2 = k.yyx.mul(epsilon);
  const offset3 = k.yxy.mul(epsilon);
  const offset4 = k.xxx.mul(epsilon);

  const sample1 = offset1.mul(getSceneDist(position.add(offset1)).distance);
  const sample2 = offset2.mul(getSceneDist(position.add(offset2)).distance);
  const sample3 = offset3.mul(getSceneDist(position.add(offset3)).distance);
  const sample4 = offset4.mul(getSceneDist(position.add(offset4)).distance);

  const gradient = sample1.add(sample2).add(sample3).add(sample4);

  return std.normalize(gradient);
};

const sqLength = (a: d.v2f | d.v3f) => {
  'use gpu';
  return std.dot(a, a);
};

const getFakeShadow = (
  position: d.v3f,
  lightDir: d.v3f,
): d.v3f => {
  'use gpu';
  if (position.y < -GroundParams.groundThickness) {
    // Applying darkening under the ground (the shadow cast by the upper ground layer)
    const fadeSharpness = 30;
    const inset = 0.02;
    const cutout = sdFloorCutout(position.xz) + inset;
    const edgeDarkening = std.saturate(1 - cutout * fadeSharpness);

    // Applying a slight gradient based on the light direction
    const lightGradient = std.saturate(-position.z * 4 * lightDir.z + 1);

    return d.vec3f(1).mul(edgeDarkening).mul(lightGradient * 0.5);
  }

  return d.vec3f(1);
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
  const lightDir = std.neg(lightUniformSlot.$.direction);

  const fakeShadow = getFakeShadow(hitPosition, lightDir);
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(rayOrigin.sub(hitPosition));
  const reflectDir = std.reflect(std.neg(lightDir), normal);
  const specularFactor = std.max(std.dot(viewDir, reflectDir), 0) **
    SPECULAR_POWER;
  const specular = lightUniformSlot.$.color.mul(
    specularFactor * SPECULAR_INTENSITY,
  );

  const baseColor = d.vec3f(0.9);

  const directionalLight = baseColor
    .mul(lightUniformSlot.$.color)
    .mul(diffuse)
    .mul(fakeShadow);
  const ambientLight = baseColor.mul(AMBIENT_COLOR).mul(AMBIENT_INTENSITY);

  const finalSpecular = specular.mul(fakeShadow);

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

const rayMarchScene = (
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  maxSteps: number,
  uv: d.v2f,
) => {
  'use gpu';
  let distanceFromOrigin = d.f32();
  let point = d.vec3f();

  for (let i = 0; i < maxSteps; i++) {
    point = rayOrigin.add(rayDirection.mul(distanceFromOrigin));
    const hit = sdBackground(point);
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST) {
      break;
    }
  }

  let color = d.vec3f();
  if (distanceFromOrigin < MAX_DIST) {
    color = renderBackground(rayOrigin, rayDirection, distanceFromOrigin).xyz;
  }

  return RayMarchResult({
    color,
    point,
  });
};

const getTickDist = (p: d.v3f, tick: number) => {
  'use gpu';
  const angle = tick / (METER_TICKS - 1) * Math.PI;
  const origin = d.vec3f(-std.cos(angle), 0, -std.sin(angle))
    .mul(GroundParams.meterCutoutRadius * 1)
    .add(d.vec3f(0, -0.1, 0));

  return std.length(p.sub(origin));
};

const renderBackground = (
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  backgroundHitDist: number,
) => {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const hitPosition = rayOrigin.add(rayDirection.mul(backgroundHitDist));

  let offsetX = d.f32();
  let offsetZ = d.f32(0.05);

  const lightDir = lightUniformSlot.$.direction;
  const causticScale = 0.2;
  offsetX -= lightDir.x * causticScale;
  offsetZ += lightDir.z * causticScale;

  const newNormal = getApproxNormal(hitPosition, 1e-4);

  // Calculate fake bounce lighting
  const jellyColor = jellyColorUniformSlot.$;
  const sqDist = sqLength(hitPosition);
  const bounceLight = jellyColor.xyz.mul(1 / (sqDist * 15 + 1) * 0.4);
  const sideBounceLight = jellyColor.xyz
    .mul(1 / (sqDist * 40 + 1) * 0.3)
    .mul(std.abs(newNormal.z));
  const emission = 1 + d.f32(state.topProgress) * 2;

  const litColor = calculateLighting(hitPosition, newNormal, rayOrigin);
  const albedo = std.select(
    LIGHT_GROUND_ALBEDO,
    DARK_GROUND_ALBEDO,
    darkModeUniformSlot.$ === 1,
  );

  let meterLight = d.vec3f(0);
  for (let i = 0; i < std.floor(METER_TICKS * state.topProgress); i++) {
    const tickDist = getTickDist(hitPosition, i);
    meterLight = meterLight.add(
      d.vec3f(1).mul(1 / (tickDist * 30 + 0.5) * 0.1),
    );
  }

  const backgroundColor = applyAO(
    albedo.mul(litColor),
    hitPosition,
    newNormal,
  )
    .add(d.vec4f(bounceLight.mul(emission), 0))
    .add(d.vec4f(sideBounceLight.mul(emission), 0))
    .add(d.vec4f(meterLight, 0));

  return d.vec4f(backgroundColor.xyz, 1);
};

const caustics = (uv: d.v2f, time: number, profile: d.v3f): d.v3f => {
  'use gpu';
  const distortion = perlin3d.sample(d.vec3f(std.mul(uv, 0.5), time * 0.2));
  // Distorting UV coordinates
  const uv2 = std.add(uv, distortion);
  const noise = std.abs(perlin3d.sample(d.vec3f(std.mul(uv2, 5), time)));
  return std.pow(d.vec3f(1 - noise), profile);
};

const renderMeter = (
  rayOrigin: d.v3f,
  rayDirection: d.v3f,
  backgroundHitDist: number,
  uv: d.v2f,
) => {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const hitPosition = rayOrigin.add(rayDirection.mul(backgroundHitDist));
  const ambientColor = jellyColorUniformSlot.$.xyz;

  // caustics
  const c1 = caustics(uv, effectTimeUniformSlot.$ * 0.2, d.vec3f(4, 4, 1)).mul(
    0.0001,
  );
  const c2 = caustics(
    uv.mul(2),
    effectTimeUniformSlot.$ * 0.4,
    d.vec3f(16, 1, 4),
  )
    .mul(0.0001);

  const blendCoord = d.vec3f(
    uv.mul(d.vec2f(5, 10)),
    effectTimeUniformSlot.$ * 0.2 + 5,
  );
  const blend = std.saturate(perlin3d.sample(blendCoord.mul(0.5)));

  const color = std.mix(ambientColor, std.add(c1, c2), blend);

  // make the color darker based on the progress
  return d.vec4f(color.mul((1 + state.topProgress) / 3), 1);
};

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f, uv: d.v2f) => {
  'use gpu';
  // first, generate the scene without a jelly or shadow
  const sceneResult = rayMarchScene(
    rayOrigin,
    rayDirection,
    MAX_STEPS,
    uv,
  );
  const scene = d.vec4f(sceneResult.color, 1);
  const sceneDist = std.distance(rayOrigin, sceneResult.point);

  // second, generate the jelly shadow

  // third, generate the jelly
  const bbox = getJellyBounds();
  const intersection = intersectBox(rayOrigin, rayDirection, bbox);

  if (!intersection.hit) {
    return scene;
  }

  let distanceFromOrigin = std.max(d.f32(0.0), intersection.tMin);

  for (let i = 0; i < MAX_STEPS; i++) {
    const currentPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

    const hitInfo = getSceneDist(currentPosition);
    distanceFromOrigin += hitInfo.distance;

    if (hitInfo.distance < SURF_DIST) {
      const hitPosition = rayOrigin.add(rayDirection.mul(distanceFromOrigin));

      if (!(hitInfo.objectType === ObjectType.JELLY)) {
        break;
      }

      const N = getApproxNormal(hitPosition, 1e-4);
      const I = rayDirection;
      const cosi = std.min(
        1.0,
        std.max(0.0, std.dot(std.neg(I), N)),
      );
      const F = fresnelSchlick(cosi, d.f32(1.0), d.f32(JELLY_IOR));

      const reflection = std.saturate(d.vec3f(hitPosition.y + 0.2));

      const eta = 1.0 / JELLY_IOR;
      const k = 1.0 - eta * eta * (1.0 - cosi * cosi);
      let refractedColor = d.vec3f();
      if (k > 0.0) {
        const refrDir = std.normalize(
          std.add(I.mul(eta), N.mul(eta * cosi - std.sqrt(k))),
        );
        const p = hitPosition.add(refrDir.mul(SURF_DIST * 2.0));
        const exitPos = p.add(refrDir.mul(SURF_DIST * 2.0));

        const env = rayMarchScene(exitPos, refrDir, 6, uv).color;
        const jellyColor = jellyColorUniformSlot.$;

        const scatterTint = jellyColor.xyz.mul(1.5);
        const density = d.f32(20.0);
        const absorb = d.vec3f(1.0).sub(jellyColor.xyz).mul(density);

        const state = knobBehaviorSlot.$.stateUniform.$;
        const rotPos = rotateY(hitPosition, -state.topProgress * Math.PI);
        const progress = std.saturate(
          std.mix(
            1,
            0.2,
            -rotPos.x * 5 + 1.5,
          ),
        );
        const T = beerLambert(absorb.mul(progress ** 2), 0.08);

        const lightDir = std.neg(lightUniformSlot.$.direction);

        const forward = std.max(0.0, std.dot(lightDir, refrDir));
        const scatter = scatterTint.mul(
          JELLY_SCATTER_STRENGTH * forward * progress ** 3,
        );
        refractedColor = env.mul(T).add(scatter);
      }

      const jelly = std.add(
        reflection.mul(F),
        refractedColor.mul(1 - F),
      );

      return d.vec4f(jelly, 1.0);
    }

    if (distanceFromOrigin > sceneDist) {
      break;
    }
  }

  return scene;
};

export const raymarchFn = tgpu['~unstable'].fragmentFn({
  in: {
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ uv }) => {
  randf.seed2(randomUniformSlot.$.mul(uv));

  const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
  const ray = getRay(ndc);

  const color = rayMarch(
    ray.origin,
    ray.direction,
    uv,
  );

  const exposure = std.select(1.5, 3, darkModeUniformSlot.$ === 1);
  return d.vec4f(std.tanh(std.pow(color.xyz.mul(exposure), d.vec3f(1.2))), 1);
});
