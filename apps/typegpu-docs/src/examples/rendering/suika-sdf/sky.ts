import { randf } from '@typegpu/noise';
import { d, std } from 'typegpu';

export const computeDaylight = (time: number) => {
  'use gpu';
  // theta=π/2 at time=0 → start at noon, full cycle every 120s
  const theta = std.fract(time / 120) * (2 * Math.PI) + Math.PI * 0.5;
  return std.smoothstep(-0.15, 0.4, std.sin(theta));
};

export const bucketBg = (scenePos: d.v2f, daylight: number) => {
  'use gpu';
  const heightGrad = std.clamp(scenePos.y * 0.25 + 0.9, 0.75, 1.0);
  const color = std.mix(
    d.vec3f(0.07, 0.07, 0.13),
    d.vec3f(0.92, 0.89, 0.84),
    daylight,
  );
  return color * heightGrad;
};

export const skyColor = (uv: d.v2f, daylight: number, time: number) => {
  'use gpu';
  const theta = std.fract(time / 120) * (2 * Math.PI) + Math.PI * 0.5;
  const sinT = std.sin(theta);
  const cosT = std.cos(theta);

  // Sky gradient blended between night and day palettes
  const skyMix = std.clamp(1 - uv.y, 0, 1);
  const daySky = std.mix(
    d.vec3f(0.98, 0.93, 0.78),
    d.vec3f(0.62, 0.86, 1.0),
    skyMix,
  );
  const nightSky = std.mix(
    d.vec3f(0.05, 0.04, 0.12),
    d.vec3f(0.02, 0.02, 0.10),
    skyMix,
  );
  let bgColor = std.mix(nightSky, daySky, daylight);

  // Stars
  const STAR_N = 50;
  const starCell = std.floor(uv * STAR_N);
  const cellUv = std.fract(uv * STAR_N);
  randf.seed2(starCell);
  const starExists = randf.sample(); // >= 0.9 → cell has a star (10% density)
  const starPx = randf.sample(); // star x within cell
  const starPy = randf.sample(); // star y within cell
  const starBright = randf.sample() * 0.7 + 0.3;
  const distToStar = std.length(cellUv - d.vec2f(starPx, starPy));
  const starDot = std.smoothstep(0.1, 0.0, distToStar);
  const twinkle = std.sin(starPx * 80 + starPy * 60 + time * 0.3) * 0.25 + 0.75;
  bgColor = bgColor +
    d.vec3f(
      starDot * std.step(0.9, starExists) * starBright * (1 - daylight) *
        twinkle * 2.5,
    );

  // Sun
  const sunX = 0.5 + cosT * 0.38;
  const sunY = 0.52 - sinT * 0.48;
  const sunDist = std.length(uv - d.vec2f(sunX, sunY));
  const sunMask = std.smoothstep(0.09, 0.055, sunDist) *
    std.clamp(sinT * 6, 0, 1);
  bgColor = std.mix(bgColor, d.vec3f(1.0, 0.97, 0.78), sunMask);

  // Moon
  const moonX = 0.5 - cosT * 0.32;
  const moonY = 0.52 + sinT * 0.4;
  const moonDist = std.length(uv - d.vec2f(moonX, moonY));
  const moonMask = std.smoothstep(0.065, 0.04, moonDist) *
    std.clamp(-sinT * 5, 0, 1);
  bgColor = std.mix(bgColor, d.vec3f(0.93, 0.95, 1.0), moonMask);

  // Dawn/dusk glow along the horizon
  const dawnDusk = std.smoothstep(-0.2, 0.12, sinT) *
    std.smoothstep(0.55, 0.12, sinT);
  const horizonBand = std.clamp(0.32 - std.abs(uv.y - 0.77), 0, 1) * 3.2;
  bgColor = std.mix(
    bgColor,
    d.vec3f(0.95, 0.45, 0.12),
    dawnDusk * horizonBand * 0.65,
  );

  // Hills
  const hillX = uv.x + time * 0.025;
  const hillLine = 0.8 + std.sin(hillX * 4.5) * 0.07 +
    std.sin(hillX * 1.8) * 0.04;
  const hillMask = std.clamp((uv.y - hillLine) * 50, 0, 1);
  const hillColor = std.mix(
    d.vec3f(0.10, 0.20, 0.12),
    d.vec3f(0.41, 0.76, 0.46),
    daylight,
  );
  bgColor = std.mix(bgColor, hillColor, hillMask);

  return bgColor;
};
