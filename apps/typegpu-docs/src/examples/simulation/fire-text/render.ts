import { tgpu, d, std } from 'typegpu';
import { hsvToRgb, rgbToHsv } from '@typegpu/color';
import { displayLayout } from './layouts.ts';
import { defaults, fireColorAccess } from './params.ts';

export const tempPowerAccess = tgpu.accessor(d.f32);

const BG_COLOR = d.vec3f(0.1);
const SMOKE_COLOR = d.vec3f(0.04);

export const tintByFireColor = (rgb: d.v3f) => {
  'use gpu';
  const hsv = rgbToHsv(rgb);
  const user = rgbToHsv(fireColorAccess.$);
  const base = rgbToHsv(defaults.fireColor);
  return hsvToRgb(
    d.vec3f(std.fract(hsv.x + user.x - base.x + 1), hsv.y * (user.y / base.y), hsv.z),
  );
};

const sampleDisplay = (uv: d.v2f) => {
  'use gpu';
  return std.textureSampleLevel(displayLayout.$.displayTex, displayLayout.$.linearSampler, uv, 0);
};

export const smokeFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const texel = sampleDisplay(uv);
  const density = texel.z;
  const rawTemperature = texel.w;
  const temperature = std.pow(rawTemperature, tempPowerAccess.$);

  // plancks law approximation (simplified tanner helland algorithm)
  // map normalized temperature to kelvins (1000K to 4000K)
  const t = 10 + temperature * 30;
  const r = 1;
  const g = std.clamp(0.3900815788 * std.log(t) - 0.6318414438, 0, 1);
  const b = std.select(std.clamp(0.5432067891 * std.log(t - 10) - 1.1962540891, 0, 1), 0, t <= 19);

  const color = tintByFireColor(d.vec3f(r, g, b));
  const intensity = density * temperature * 2.5;
  const fireColor = color * intensity;
  const fluidColor = fireColor + SMOKE_COLOR;
  const finalColor = std.mix(BG_COLOR, fluidColor, std.min(density, 1));

  return d.vec4f(finalColor, 1);
});

export const densityFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const density = sampleDisplay(uv).z;
  const finalColor = std.mix(BG_COLOR, d.vec3f(density), std.min(density, 1));
  return d.vec4f(finalColor, 1);
});

export const velocityFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const vel = sampleDisplay(uv).xy;
  const speed = std.length(vel);
  const normVel = vel * 0.02;
  const dirColor = d.vec3f(
    std.clamp(0.5 + normVel.x, 0, 1),
    std.clamp(0.5 + normVel.y, 0, 1),
    std.clamp(speed * 0.02, 0, 1),
  );
  const finalColor = std.mix(BG_COLOR, dirColor, std.min(speed * 0.05, 1));
  return d.vec4f(finalColor, 1);
});
