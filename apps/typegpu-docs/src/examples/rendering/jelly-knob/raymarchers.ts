import { tgpu, d, std } from 'typegpu';
import { perlin3d, randf } from '@typegpu/noise';
import { linearToSrgb } from '@typegpu/color';
import {
  cameraUniformSlot,
  darkModeUniformSlot,
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
  dialShadow,
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
  EXPOSURE,
  GROUND_ALBEDO,
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
import { bottomReflectionMask, jellyReflection } from './material.ts';

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

const getFakeShadow = (position: d.v3f, lightDir: d.v3f): d.v3f => {
  'use gpu';
  if (position.y < -GroundParams.groundThickness) {
    // Applying darkening under the ground (the shadow cast by the upper ground layer)
    const fadeSharpness = d.f32(30);
    const inset = 0.02;
    const cutout = sdFloorCutout(position.xz) + inset;
    const edgeDarkening = std.saturate(1 - cutout * fadeSharpness);

    // Applying a slight gradient based on the light direction
    const lightGradient = std.saturate(-position.z * 4 * lightDir.z + 1);

    return d
      .vec3f(1)
      .mul(edgeDarkening)
      .mul(lightGradient * 0.5);
  }

  return d.vec3f(1);
};

const calculateAO = (position: d.v3f, normal: d.v3f) => {
  'use gpu';
  let totalOcclusion = d.f32(0.0);
  let sampleWeight = d.f32(1.0);
  const stepDistance = AO_RADIUS / AO_STEPS;

  for (const i of std.range(1, AO_STEPS + 1)) {
    const sampleHeight = stepDistance * d.f32(i);
    const samplePosition = position.add(normal.mul(sampleHeight));
    const distanceToSurface = getSceneDistForAO(samplePosition) - AO_BIAS;
    const occlusionContribution = std.max(0.0, sampleHeight - distanceToSurface);
    totalOcclusion += occlusionContribution * sampleWeight;
    sampleWeight *= 0.5;
    if (totalOcclusion > AO_RADIUS / AO_INTENSITY) {
      break;
    }
  }

  const rawAO = 1.0 - (AO_INTENSITY * totalOcclusion) / AO_RADIUS;
  return std.saturate(rawAO);
};

const calculateLighting = (hitPosition: d.v3f, normal: d.v3f, rayOrigin: d.v3f) => {
  'use gpu';
  const lightDir = std.neg(lightUniformSlot.$.direction);

  const fakeShadow = getFakeShadow(hitPosition, lightDir);
  const diffuse = std.max(std.dot(normal, lightDir), 0.0);

  const viewDir = std.normalize(rayOrigin.sub(hitPosition));
  const reflectDir = std.reflect(std.neg(lightDir), normal);
  const dark = darkModeUniformSlot.$ === 1;
  const specularFactor =
    std.max(std.dot(viewDir, reflectDir), 0) ** std.select(d.f32(96), SPECULAR_POWER, dark);
  const specular = lightUniformSlot.$.color.mul(
    specularFactor * std.select(1.2, SPECULAR_INTENSITY, dark),
  );

  const baseColor = d.vec3f(0.9);

  const directionalLight = baseColor.mul(lightUniformSlot.$.color).mul(diffuse).mul(fakeShadow);
  const ambientLight = baseColor.mul(AMBIENT_COLOR).mul(AMBIENT_INTENSITY);

  const finalSpecular = specular.mul(fakeShadow);

  return directionalLight.add(ambientLight).add(finalSpecular);
};

const applyAO = (litColor: d.v3f, hitPosition: d.v3f, normal: d.v3f) => {
  'use gpu';
  const ao = calculateAO(hitPosition, normal);
  const finalColor = litColor.mul(std.pow(ao, std.select(2.5, 1, darkModeUniformSlot.$ === 1)));
  return d.vec4f(finalColor, 1.0);
};

const rayMarchScene = (rayOrigin: d.v3f, rayDirection: d.v3f, maxSteps: number) => {
  'use gpu';
  let distanceFromOrigin = d.f32();
  let point = d.vec3f();

  for (let i = 0; i < maxSteps; i++) {
    point = rayOrigin.add(rayDirection.mul(distanceFromOrigin));
    const hit = std.min(sdBackground(point), sdMeter(point));
    distanceFromOrigin += hit;
    if (distanceFromOrigin > MAX_DIST || hit < SURF_DIST) {
      break;
    }
  }

  let color = d.vec3f();
  if (distanceFromOrigin < MAX_DIST) {
    color = std.select(
      renderBackground(rayOrigin, rayDirection, distanceFromOrigin),
      renderMeter(rayOrigin, rayDirection, distanceFromOrigin),
      sdMeter(point) < SURF_DIST,
    ).xyz;
  }

  return RayMarchResult({
    color,
    point,
  });
};

const getTickDist = (p: d.v3f, tick: number) => {
  'use gpu';
  const angle = (tick / (METER_TICKS - 1)) * Math.PI;
  const origin = d
    .vec3f(-std.cos(angle), 0, -std.sin(angle))
    .mul(GroundParams.meterCutoutRadius * 1)
    .add(d.vec3f(0, -0.1, 0));

  return std.length(p.sub(origin));
};

// One bounded reflection of the jelly, without recursively shading the ground.
const reflectJelly = (position: d.v3f, direction: d.v3f) => {
  'use gpu';
  const bounds = intersectBox(position, direction, getJellyBounds());
  if (!bounds.hit) return d.vec4f();
  let distance = std.max(bounds.tMin, SURF_DIST * 4);
  for (let i = 0; i < 32; i++) {
    const point = position + direction * distance;
    const step = sdJelly(point);
    if (step < SURF_DIST * 2) {
      const normal = getApproxNormal(point, 1e-4);
      const diffuse = std.max(std.dot(normal, std.neg(lightUniformSlot.$.direction)), 0);
      const rim = (1 - std.saturate(std.dot(normal, std.neg(direction)))) ** 3;
      const bottom = bottomReflectionMask(
        point,
        normal,
        cameraUniformSlot.$.viewInv.columns[3].xyz,
      );
      const color =
        jellyColorUniformSlot.$.xyz * (0.16 + diffuse * 0.35) + d.vec3f(rim * 0.2 * (1 - bottom));
      return d.vec4f(color, 1);
    }
    distance += std.max(step, SURF_DIST);
    if (distance > bounds.tMax) break;
  }
  return d.vec4f();
};

const groundCaustics = (position: d.v3f) => {
  'use gpu';
  // Project a scalloped focal pattern along the light, following the twisting lobes.
  // This is an artistic approximation of focused transmission, not photon tracing.
  const light = lightUniformSlot.$.direction;
  const projectedDirection = light.xz / -light.y;
  // Keep the stylized focal pattern close to the knob under grazing light.
  const projection = projectedDirection / std.max(1, std.length(projectedDirection) / 1.2);
  const p = (position.xz - projection * 0.34) / d.vec2f(1, 1.18);
  const radius = std.length(p);
  const angle = std.atan2(p.y, p.x);
  const state = knobBehaviorSlot.$.stateUniform.$;
  const phase = state.bottomProgress * Math.PI;
  const fold = std.cos((angle + phase) * 12);
  const distortion = std.sin(angle * 5 - phase) * 0.018;
  const outer = (radius - (0.24 + fold * 0.015 + distortion)) / 0.012;
  const inner = (radius - (0.18 - fold * 0.012)) / 0.019;
  const focus = std.exp(-outer * outer) + std.exp(-inner * inner) * 0.45;
  const breakup = std.smoothstep(
    -0.15,
    0.65,
    std.sin(angle * 3 + phase) * std.cos(angle * 5 - phase),
  );
  const tint = std.mix(jellyColorUniformSlot.$.xyz, d.vec3f(1), 0.02);
  return tint * focus * breakup * 0.35;
};

const renderBackground = (rayOrigin: d.v3f, rayDirection: d.v3f, backgroundHitDist: number) => {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const hitPosition = rayOrigin.add(rayDirection.mul(backgroundHitDist));

  const newNormal = getApproxNormal(hitPosition, 1e-4);

  // Calculate fake bounce lighting
  const jellyColor = jellyColorUniformSlot.$;
  const sqDist = sqLength(hitPosition);
  // Keep the colored spill local so the outer ground retains its blue-gray tint.
  const bounceLight = jellyColor.xyz.mul((1 / (sqDist * 15 + 1)) ** 2 * 0.4);
  const sideBounceLight = jellyColor.xyz
    .mul((1 / (sqDist * 40 + 1)) ** 2 * 0.3)
    .mul(std.abs(newNormal.z));
  const dark = darkModeUniformSlot.$ === 1;
  const emission = (1 + d.f32(state.topProgress) * 2) * std.select(0.12, 1, dark);

  const litColor = calculateLighting(hitPosition, newNormal, rayOrigin);
  const albedo = std.select(LIGHT_GROUND_ALBEDO, GROUND_ALBEDO, dark);
  // Project the knob's soft shadow along the incoming light, toward the camera.
  let contactShadow = d.vec3f(1);
  if (!dark && hitPosition.y < 0.02) {
    const light = lightUniformSlot.$.direction;
    const projection = light.xz / -light.y;
    const shadowPosition = (hitPosition.xz - projection * 0.34) / d.vec2f(0.36, 0.48);
    const contact = std.exp(-sqLength(hitPosition.xz / d.vec2f(0.35)) * 2);
    const castShadow = std.exp(-sqLength(shadowPosition) * 1.6);
    // Preserve the neutral contact shadow; tint only the light transmitted through jelly.
    const transmitted = jellyColor.xyz.mul(0.12).add(0.35);
    contactShadow = std.mix(d.vec3f(1), transmitted, castShadow).sub(0.2 * contact);
  }

  let meterLight = d.vec3f(0);
  const litTickCount = d.i32(std.floor(METER_TICKS * state.topProgress));
  for (let i = 0; i < litTickCount; i++) {
    const tickDist = getTickDist(hitPosition, i);
    meterLight = meterLight.add(d.vec3f(0.2 / (1 + (tickDist * 30) ** 2)));
  }

  let backgroundColor = applyAO(albedo.mul(litColor).mul(contactShadow), hitPosition, newNormal)
    .add(d.vec4f(bounceLight.mul(emission), 0))
    .add(d.vec4f(sideBounceLight.mul(emission), 0))
    .add(d.vec4f(meterLight.mul(std.select(0.15, 1, dark)), 0));

  if (!dark && hitPosition.y < 0.02 && newNormal.y > 0.95) {
    const reflected = reflectJelly(
      hitPosition + newNormal * SURF_DIST * 4,
      std.reflect(rayDirection, newNormal),
    );
    const fresnel =
      0.22 + 0.35 * (1 - std.saturate(std.dot(std.neg(rayDirection), newNormal))) ** 5;
    backgroundColor = d.vec4f(
      std.mix(backgroundColor.xyz, reflected.xyz, reflected.w * fresnel),
      1,
    );
    backgroundColor += d.vec4f(groundCaustics(hitPosition), 0);
  }

  return d.vec4f(backgroundColor.xyz, 1);
};

const getMeterLedLight = (position: d.v3f) => {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const dark = darkModeUniformSlot.$ === 1;
  // Colored emitters stay legible in daylight against the smoked glass channel.
  const ledColor = std.select(
    std.mix(d.vec3f(0.12), jellyColorUniformSlot.$.xyz, 0.88),
    d.vec3f(0.95, 0.97, 1),
    dark,
  );
  let light = d.vec3f(0);

  for (const tick of tgpu.unroll(std.range(METER_TICKS))) {
    const angle = (tick / (METER_TICKS - 1)) * Math.PI;
    const ledPosition = d
      .vec2f(-std.cos(angle), -std.sin(angle))
      .mul(GroundParams.meterCutoutRadius);
    const distanceToLed = std.distance(position.xz, ledPosition);
    const core = 1 - std.smoothstep(0.006, 0.022, distanceToLed);
    const localGlow = std.exp(-distanceToLed * distanceToLed * 420);
    const wideGlow = std.exp(-distanceToLed * distanceToLed * 130);
    const isLit = state.topProgress * METER_TICKS >= tick + 1;
    const intensity = std.select(0.035, 1, isLit);

    const emitter = ledColor * intensity * (core * 2.2 + localGlow * 0.65 + wideGlow * 0.2);
    light += std.select(d.vec3f(0.08 * core), emitter, dark || isLit);
  }

  return light;
};

const renderMeter = (rayOrigin: d.v3f, rayDirection: d.v3f, distanceFromOrigin: number) => {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const hitPosition = rayOrigin + rayDirection * distanceFromOrigin;
  const viewDirection = std.normalize(rayOrigin - hitPosition);
  const fresnel = (1 - std.saturate(viewDirection.y)) ** 3;
  const frostNoise = perlin3d.sample(hitPosition * 38);
  const frost = 0.82 + frostNoise * 0.08;
  const jellyColor = jellyColorUniformSlot.$;
  const jellyBounce = jellyColor.xyz.mul(
    (1 / (sqLength(hitPosition) * 15 + 1)) * (0.24 + state.topProgress * 0.24),
  );
  const dark = darkModeUniformSlot.$ === 1;
  const glassTint = std.select(d.vec3f(0.18, 0.21, 0.26), d.vec3f(0.075, 0.09, 0.105), dark);
  const jellyLightFilter = std.mix(d.vec3f(1), jellyColor.xyz, std.select(0.12, 0.55, dark));
  const glass =
    glassTint * jellyLightFilter * frost +
    jellyBounce * std.select(0.15, 1, dark) +
    d.vec3f(fresnel * 0.32);
  const ledLight = getMeterLedLight(hitPosition);

  return d.vec4f(glass + ledLight, 1);
};

const rayMarch = (rayOrigin: d.v3f, rayDirection: d.v3f) => {
  'use gpu';
  // first, generate the scene without a jelly or shadow
  const sceneResult = rayMarchScene(rayOrigin, rayDirection, MAX_STEPS);
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

  for (const _i of std.range(MAX_STEPS)) {
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
      const cosi = std.min(1.0, std.max(0.0, std.dot(std.neg(I), N)));
      const F = fresnelSchlick(cosi, d.f32(1.0), d.f32(JELLY_IOR));

      const reflection = jellyReflection(hitPosition, N, rayOrigin);

      const eta = 1.0 / JELLY_IOR;
      const k = 1.0 - eta * eta * (1.0 - cosi * cosi);
      let refractedColor = d.vec3f();
      if (k > 0.0) {
        const refrDir = std.normalize(std.add(I.mul(eta), N.mul(eta * cosi - std.sqrt(k))));
        const p = hitPosition.add(refrDir.mul(SURF_DIST * 2.0));
        const exitPos = p.add(refrDir.mul(SURF_DIST * 2.0));

        const env = rayMarchScene(exitPos, refrDir, 6).color;
        const jellyColor = jellyColorUniformSlot.$;

        const scatterTint = jellyColor.xyz.mul(1.5);
        const density = d.f32(20.0);
        const absorb = d.vec3f(1.0).sub(jellyColor.xyz).mul(density);

        const state = knobBehaviorSlot.$.stateUniform.$;
        const rotPos = rotateY(hitPosition, -state.topProgress * Math.PI);
        const progress = std.saturate(std.mix(1, 0.2, -rotPos.x * 5 + 1.5));
        // More absorption keeps the daylight jelly richly colored over a bright floor.
        const absorptionProgress = std.select(
          std.max(progress, 0.55),
          progress,
          darkModeUniformSlot.$ === 1,
        );
        const T = beerLambert(
          absorb.mul(absorptionProgress ** 2),
          std.select(0.14, 0.08, darkModeUniformSlot.$ === 1),
        );

        const lightDir = std.neg(lightUniformSlot.$.direction);

        const forward = std.max(0.0, std.dot(lightDir, refrDir));
        const scatter = scatterTint.mul(JELLY_SCATTER_STRENGTH * forward * progress ** 3);
        refractedColor = env.mul(T).add(scatter);
      }

      let jelly = std.add(reflection.mul(F), refractedColor.mul(1 - F));
      if (darkModeUniformSlot.$ === 0) {
        // Broad studio fill reveals the material even when forward scattering is weak.
        const lightDir = std.neg(lightUniformSlot.$.direction);
        const diffuse = std.max(std.dot(N, lightDir), 0);
        const fill = jellyColorUniformSlot.$.xyz * (0.1 + diffuse * 0.2);
        const halfVector = std.normalize(lightDir - I);
        const highlight = std.max(std.dot(N, halfVector), 0) ** 80;
        const bottom = bottomReflectionMask(hitPosition, N, rayOrigin);
        jelly += fill + d.vec3f(highlight * 0.35 * (1 - bottom));
        jelly = jelly.mul(dialShadow(hitPosition, knobBehaviorSlot.$.stateUniform.$.topProgress));
      }

      return d.vec4f(jelly, 1.0);
    }

    if (distanceFromOrigin > sceneDist) {
      break;
    }
  }

  return scene;
};

export const raymarchFn = tgpu.fragmentFn({
  in: {
    uv: d.vec2f,
  },
  out: d.vec4f,
})(({ uv }) => {
  randf.seed2(randomUniformSlot.$.mul(uv));

  const ndc = d.vec2f(uv.x * 2 - 1, -(uv.y * 2 - 1));
  const ray = getRay(ndc);

  const color = rayMarch(ray.origin, ray.direction);

  // ACES filmic fit: a dark toe and a soft shoulder for the jelly and LED cores.
  // https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/
  const exposed = std
    .max(color.xyz, d.vec3f(0))
    .mul(std.select(1.1, EXPOSURE, darkModeUniformSlot.$ === 1));
  const mapped = std.saturate(
    exposed
      .mul(exposed.mul(2.51).add(0.03))
      .div(exposed.mul(exposed.mul(2.43).add(0.59)).add(0.14)),
  );
  // The unorm targets do not encode sRGB; do it once before the display-space TAA.
  return d.vec4f(linearToSrgb(mapped), 1);
});
