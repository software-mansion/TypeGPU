import { d, std } from 'typegpu';

export const skyColor = (uv: d.v2f, scenePos: d.v2f, time: number) => {
  'use gpu';
  const skyTop = d.vec3f(0.62, 0.86, 1.0);
  const skyBottom = d.vec3f(0.98, 0.93, 0.78);
  const skyMix = std.clamp(scenePos.y * 0.5 + 0.5, 0, 1);
  let bgColor = std.mix(skyBottom, skyTop, skyMix);

  const sunPos = d.vec2f(0.78, 0.2);
  const sunDist = std.length(uv.sub(sunPos));
  const sunMask = std.clamp((0.1 - sunDist) * 40.0, 0, 1);
  bgColor = std.mix(bgColor, d.vec3f(1.0, 0.95, 0.74), sunMask);

  const hillX = uv.x + time * 0.025;
  const hillLine = 0.8 + std.sin(hillX * 4.5) * 0.07 +
    std.sin(hillX * 1.8) * 0.04;
  const hillMask = std.clamp((uv.y - hillLine) * 50.0, 0, 1);
  bgColor = std.mix(bgColor, d.vec3f(0.41, 0.76, 0.46), hillMask);

  return bgColor;
};
