import { d, std } from 'typegpu';
import { GAME_ASPECT, SCENE_SCALE, WALL_COLOR } from './constants.ts';

export const rotate2d = (p: d.v2f, angle: number) => {
  'use gpu';
  const cosA = std.cos(angle);
  const sinA = std.sin(angle);
  return d.mat2x2f(cosA, sinA, -sinA, cosA) * p;
};

export const clampRadial = (
  p: d.v2f,
  clampRadius: number,
  minRadius: number,
) => {
  'use gpu';
  const len = std.max(std.length(p), minRadius);
  return p * std.min(clampRadius / len, 1);
};

export const circleUv = (p: d.v2f) => {
  'use gpu';
  return d.vec2f(p.x + 0.5, 0.5 - p.y);
};

export const uvToScene = (uv: d.v2f) => {
  'use gpu';
  return d.vec2f((uv.x * 2 - 1) * SCENE_SCALE, (1 - uv.y * 2) * SCENE_SCALE);
};

export const canvasToGameUv = (uv: d.v2f, canvasAspect: number) => {
  'use gpu';
  const scale = std.select(
    d.vec2f(1, canvasAspect / GAME_ASPECT),
    d.vec2f(GAME_ASPECT / canvasAspect, 1),
    canvasAspect > GAME_ASPECT,
  );
  const offset = (d.vec2f(1) - scale) * 0.5;
  return (uv - offset) / scale;
};

export const wallColor = (local: d.v2f, dist: number, daylight: number) => {
  'use gpu';
  const stripe = std.abs(std.fract(local.x * 18.0 + local.y * 6.0) - 0.5);
  const stripeMask = std.clamp(0.55 - stripe * 1.6, 0, 1);
  const speck = std.abs(std.sin((local.x + local.y * 3.0) * 45.0)) * 0.04;
  const texture = stripeMask * 0.08 + speck;
  const edgeShade = std.clamp(0.35 - dist * 12.0, 0, 0.35);
  const baseColor = WALL_COLOR + d.vec3f(1, 0.8, 0.6) * (edgeShade + texture);
  return std.mix(baseColor * 0.12, baseColor, daylight);
};
