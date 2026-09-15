import { d, std, tgpu } from 'typegpu';

const RING_OFFSETS = [-1, 0, 1] as const;

export const RelightMode = {
  RELIT: 0,
  CAMERA: 1,
  DEPTH: 2,
  NORMALS: 3,
} as const;

const NEAR_Z = 0;
/** Depth of the furthest surface the relit scene can hold */
export const SURFACE_FAR_Z = -0.7;
const LIGHT_RADIUS = 0.85;
const LIGHT_WRAP = 0.25;
const RELIEF_SCALE = 200;
const SLOPE_COMPRESSION = 0.55;
const SPECULAR_POWER = 36;
const SPECULAR_F0 = 0.06;
const GAMMA = 2.2;
const WHITE_POINT = 2.6;
const LUMINANCE_WEIGHTS = d.vec3f(0.2126, 0.7152, 0.0722);
const HIGHLIGHT_BLEACH = 2;
const AMBIENT_FILL = d.vec3f(0.78, 0.86, 1);
const DITHER_STEP = 1 / 255;

const BULB_WORLD_RADIUS = 0.05;
const BULB_CAMERA_Z = 2;
const BULB_REFERENCE_Z = 0.42;
const BULB_CORE = 8;
const BULB_LIMB = 0.28;
const BULB_EDGE = 0.75;
const BULB_EDGE_FLOOR = 0.004;
const BULB_EDGE_LIMIT = 0.3;
const BULB_HALO = 1.6;
const BULB_HALO_SPAN = 1.2;
const BULB_VEIL = 0.12;
const BULB_VEIL_SPAN = 4;
const BULB_ONSET = 0.6;
const BULB_OCCLUSION_SOFTNESS = 0.02;
const BULB_SOURCE_SOFTNESS = 0.08;
const BULB_SAMPLE_SPREAD = 0.6;
const BULB_SAMPLES = RING_OFFSETS.length ** 2;

const SHADOW_FAR_Z = -1.25;
const SHADOW_STEPS = 32;
const SHADOW_SPAN = 0.3;
const SHADOW_BASELINE = 0.005;
const SHADOW_BIAS = 0.014;
const SHADOW_SLOPE_BIAS = 0.02;
const SHADOW_THICKNESS = 0.7;
const SHADOW_THICKNESS_GROWTH = 2.6;
const SHADOW_SOFTNESS = 0.089;
const SHADOW_GAIN = 2.5;
/** How far above the light plane an occluder may rise before it stops casting */
const SHADOW_FRONT_FADE = 0.2;

export const RelightParams = d.struct({
  uvTransform: d.mat2x2f,
  lightColor: d.vec4f,
  lightPosition: d.vec2f,
  lightZ: d.f32,
  exposure: d.f32,
  intensity: d.f32,
  relief: d.f32,
  specular: d.f32,
  shadow: d.f32,
  occlusion: d.f32,
  swapAxes: d.u32,
  mirror: d.u32,
  mode: d.u32,
});

export const relightLayout = tgpu.bindGroupLayout({
  params: { uniform: RelightParams },
  surface: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

export const relightFrameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});

function surfaceZ(depth: number): number {
  'use gpu';
  return std.mix(d.f32(SURFACE_FAR_Z), d.f32(NEAR_Z), depth);
}

function shadowZ(depth: number): number {
  'use gpu';
  return std.mix(d.f32(SHADOW_FAR_Z), d.f32(NEAR_Z), depth);
}

function depthAt(uv: d.v2f): number {
  'use gpu';
  return std.textureSampleLevel(relightLayout.$.surface, relightLayout.$.sampler, uv, 0).w;
}

function cameraUvAt(uv: d.v2f): d.v2f {
  'use gpu';
  let sourceSize = d.vec2f(std.textureDimensions(relightFrameLayout.$.frame));
  if (relightLayout.$.params.swapAxes !== 0) {
    sourceSize = d.vec2f(sourceSize.yx);
  }
  let framed = d.vec2f(uv);
  if (relightLayout.$.params.mirror !== 0) {
    framed = d.vec2f(1 - uv.x, uv.y);
  }
  const side = std.min(sourceSize.x, sourceSize.y);
  const sourcePixel = (sourceSize - side) * 0.5 + framed * side - 0.5;
  const clamped = std.clamp(sourcePixel, d.vec2f(0), sourceSize - 1);
  const sourceUv = (clamped + 0.5) / sourceSize;
  return relightLayout.$.params.uvTransform * (sourceUv - d.vec2f(0.5)) + d.vec2f(0.5);
}

function dither(uv: d.v2f): number {
  'use gpu';
  const point = uv * 1024;
  return std.fract(52.9829189 * std.fract(0.06711056 * point.x + 0.00583715 * point.y));
}

function shadowFactor(origin: d.v3f, lightDirection: d.v3f, reach: number, jitter: number): number {
  'use gpu';
  const stride = reach / d.f32(SHADOW_STEPS);
  const baselineTravel = reach * (SHADOW_BASELINE / SHADOW_SPAN);
  const trailProbe = origin - lightDirection * baselineTravel;
  const receiverRise = std.max(
    origin.z - shadowZ(depthAt(trailProbe.xy + d.vec2f(0.5))) - baselineTravel * lightDirection.z,
    d.f32(0),
  );
  const risePerTravel = receiverRise / baselineTravel;

  let occlusion = d.f32(0);
  for (const step of std.range(SHADOW_STEPS)) {
    const travel = (d.f32(step) + jitter) * stride;
    const probe = origin + lightDirection * travel;
    const sampleZ = shadowZ(depthAt(probe.xy + d.vec2f(0.5)));
    const difference = sampleZ - probe.z;
    const bias = SHADOW_BIAS + travel * (SHADOW_SLOPE_BIAS + risePerTravel);
    const thickness = SHADOW_THICKNESS * (1 + (travel / SHADOW_SPAN) * SHADOW_THICKNESS_GROWTH);
    if (difference > bias && difference < thickness) {
      const behindLight =
        1 - std.saturate((sampleZ - relightLayout.$.params.lightZ) / SHADOW_FRONT_FADE);
      occlusion += std.saturate((difference - bias) / SHADOW_SOFTNESS) * behindLight;
    }
  }
  return 1 - std.saturate((occlusion / d.f32(SHADOW_STEPS)) * SHADOW_GAIN);
}

function depthRamp(value: number): d.v3f {
  'use gpu';
  const cold = d.vec3f(0.03, 0.02, 0.12);
  const middle = d.vec3f(0.11, 0.45, 0.94);
  const warm = d.vec3f(0.85, 0.36, 0.96);
  const hot = d.vec3f(0.97, 0.97, 0.87);
  if (value < 0.4) {
    return std.mix(cold, middle, value / 0.4);
  }
  if (value < 0.75) {
    return std.mix(middle, warm, (value - 0.4) / 0.35);
  }
  return std.mix(warm, hot, (value - 0.75) / 0.25);
}

function bulbRadius(): number {
  'use gpu';
  return (
    BULB_WORLD_RADIUS *
    ((BULB_CAMERA_Z - BULB_REFERENCE_Z) / (BULB_CAMERA_Z - relightLayout.$.params.lightZ))
  );
}

function bulbExposure(radius: number): number {
  'use gpu';
  let open = d.f32(0);
  for (const stepY of tgpu.unroll(RING_OFFSETS)) {
    for (const stepX of tgpu.unroll(RING_OFFSETS)) {
      const probe =
        relightLayout.$.params.lightPosition +
        d.vec2f(stepX, stepY) * (radius * BULB_SAMPLE_SPREAD);
      open += std.smoothstep(
        d.f32(0),
        BULB_SOURCE_SOFTNESS,
        relightLayout.$.params.lightZ - surfaceZ(depthAt(probe)),
      );
    }
  }
  return open / d.f32(BULB_SAMPLES);
}

function bulbSurface(uv: d.v2f, tint: d.v3f, depth: number): d.v4f {
  'use gpu';
  const radius = bulbRadius();
  const spread = std.length(uv - relightLayout.$.params.lightPosition) / radius;
  const limb = std.saturate(spread);
  const dome = std.sqrt(std.max(1 - limb * limb, d.f32(0)));
  const facing = dome * dome;
  const front = relightLayout.$.params.lightZ + BULB_WORLD_RADIUS * dome;
  const solid = std.smoothstep(d.f32(0), BULB_OCCLUSION_SOFTNESS, front - surfaceZ(depth));
  const edge = std.clamp(std.fwidth(spread) * BULB_EDGE, BULB_EDGE_FLOOR, BULB_EDGE_LIMIT);
  const coverage = (1 - std.smoothstep(1 - edge, 1 + edge, spread)) * solid;
  const hue = std.mix(tint, d.vec3f(1), facing * facing);
  return d.vec4f(hue * (BULB_CORE * std.mix(d.f32(BULB_LIMB), d.f32(1), facing)), coverage);
}

function bulbGlow(uv: d.v2f, tint: d.v3f): d.v3f {
  'use gpu';
  const radius = bulbRadius();
  const radii = std.length(uv - relightLayout.$.params.lightPosition) / radius;
  const halo = std.exp(0 - radii / BULB_HALO_SPAN);
  const veil = std.exp(0 - radii / BULB_VEIL_SPAN);
  return tint * ((halo * BULB_HALO + veil * BULB_VEIL) * bulbExposure(radius));
}

function bulbPresence(): number {
  'use gpu';
  return std.saturate(relightLayout.$.params.intensity / BULB_ONSET);
}

function compress(value: number): number {
  'use gpu';
  return (value * (value / (WHITE_POINT * WHITE_POINT) + 1)) / (value + 1);
}

function tonemap(color: d.v3f): d.v3f {
  'use gpu';
  const luminance = std.max(std.dot(color, LUMINANCE_WEIGHTS), d.f32(0.0001));
  const mapped = compress(luminance);
  const shoulder = color / d.vec3f(WHITE_POINT * WHITE_POINT) + d.vec3f(1);
  const perChannel = (color * shoulder) / (color + d.vec3f(1));
  const bleach = std.pow(std.saturate(mapped), d.f32(HIGHLIGHT_BLEACH));
  return std.saturate(std.mix(color * (mapped / luminance), perChannel, bleach));
}

export const relightFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const cameraColor = std.saturate(
    std.textureSampleBaseClampToEdge(
      relightFrameLayout.$.frame,
      relightLayout.$.sampler,
      cameraUvAt(uv),
    ).rgb,
  );
  if (relightLayout.$.params.mode === RelightMode.CAMERA) {
    return d.vec4f(cameraColor, 1);
  }

  const surface = std.textureSampleLevel(relightLayout.$.surface, relightLayout.$.sampler, uv, 0);
  if (relightLayout.$.params.mode === RelightMode.DEPTH) {
    return d.vec4f(depthRamp(std.saturate(surface.w)), 1);
  }

  const slope = surface.xy * (relightLayout.$.params.relief * RELIEF_SCALE);
  const tilt = d.vec2f(0) - slope / (1 + std.length(slope) * SLOPE_COMPRESSION);
  const normal = std.normalize(d.vec3f(tilt, 1));
  if (relightLayout.$.params.mode === RelightMode.NORMALS) {
    return d.vec4f(normal * 0.5 + 0.5, 1);
  }

  const centered = uv - d.vec2f(0.5);
  const noise = dither(uv);
  const position = d.vec3f(centered, surfaceZ(surface.w));
  const lightPosition = d.vec3f(
    relightLayout.$.params.lightPosition - d.vec2f(0.5),
    relightLayout.$.params.lightZ,
  );
  const toLight = lightPosition - position;
  const distance = std.max(std.length(toLight), 0.0001);
  const lightDirection = toLight / distance;
  const spread = distance / LIGHT_RADIUS;
  const falloff = 1 / (1 + spread * spread);
  const wrapped = std.saturate((std.dot(normal, lightDirection) + LIGHT_WRAP) / (1 + LIGHT_WRAP));
  const lambert = wrapped * wrapped;

  let shadow = d.f32(1);
  if (relightLayout.$.params.shadow > 0) {
    const shadowOrigin = d.vec3f(centered, shadowZ(surface.w));
    const shadowToLight = lightPosition - shadowOrigin;
    const shadowDistance = std.max(std.length(shadowToLight), 0.0001);
    const reach =
      shadowDistance * (SHADOW_SPAN / std.max(std.length(shadowToLight.xy), d.f32(SHADOW_SPAN)));
    const traced = shadowFactor(shadowOrigin, shadowToLight / shadowDistance, reach, noise);
    shadow = std.mix(d.f32(1), traced, relightLayout.$.params.shadow);
  }
  const occlusion = std.mix(d.f32(1), surface.z, relightLayout.$.params.occlusion);

  const albedo = std.pow(cameraColor, d.vec3f(GAMMA));
  const tint = d.vec3f(relightLayout.$.params.lightColor.rgb);
  const halfDirection = std.normalize(lightDirection + d.vec3f(0, 0, 1));
  const lobe = std.pow(std.saturate(std.dot(normal, halfDirection)), d.f32(SPECULAR_POWER));
  const grazing = std.pow(1 - std.saturate(normal.z), d.f32(5));
  const highlight = lobe * (SPECULAR_F0 + (1 - SPECULAR_F0) * grazing);

  let lit = albedo * AMBIENT_FILL * (relightLayout.$.params.exposure * occlusion);
  lit += albedo * tint * (lambert * falloff * shadow * relightLayout.$.params.intensity);
  lit +=
    tint *
    (highlight *
      falloff *
      shadow *
      occlusion *
      relightLayout.$.params.specular *
      relightLayout.$.params.intensity);
  const presence = bulbPresence();
  const bulb = bulbSurface(uv, tint, surface.w);
  lit = std.mix(lit, bulb.xyz * presence, bulb.w * presence);
  lit += bulbGlow(uv, tint) * presence;
  const display = std.pow(tonemap(lit), d.vec3f(1 / GAMMA));
  return d.vec4f(display + (noise - 0.5) * DITHER_STEP, 1);
});
