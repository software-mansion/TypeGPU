import tgpu, { d, std } from 'typegpu';
import { distSampleLayout, paramsAccess } from './types.ts';

const outsideGradient = tgpu.const(d.arrayOf(d.vec3f, 5), [
  d.vec3f(0.05, 0.05, 0.15),
  d.vec3f(0.2, 0.1, 0.4),
  d.vec3f(0.6, 0.2, 0.5),
  d.vec3f(0.95, 0.5, 0.3),
  d.vec3f(1.0, 0.95, 0.8),
]);

const insideGradient = tgpu.const(d.arrayOf(d.vec3f, 5), [
  d.vec3f(0.05, 0.05, 0.15),
  d.vec3f(0.1, 0.2, 0.3),
  d.vec3f(0.2, 0.45, 0.55),
  d.vec3f(0.4, 0.75, 0.7),
  d.vec3f(0.9, 1.0, 0.95),
]);

export const distanceFrag = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const size = std.textureDimensions(distSampleLayout.$.distTexture);
  let dist = std.textureSample(distSampleLayout.$.distTexture, distSampleLayout.$.sampler, uv).x;

  if (paramsAccess.$.showInside === 0 && dist < 0) {
    dist = 0;
  }
  if (paramsAccess.$.showOutside === 0 && dist > 0) {
    dist = 0;
  }

  const unsigned = std.abs(dist);

  const maxDist = d.f32(std.max(size.x, size.y)) * 0.25;
  const t = std.saturate(unsigned / maxDist);

  const gradientPos = t * 4.0;
  const idx = d.u32(gradientPos);
  const frac = std.fract(gradientPos);

  const outsideBase = std.mix(
    outsideGradient.$[std.min(idx, 4)],
    outsideGradient.$[std.min(idx + 1, 4)],
    frac,
  );

  const insideBase = std.mix(
    insideGradient.$[std.min(idx, 4)],
    insideGradient.$[std.min(idx + 1, 4)],
    frac,
  );

  let baseColor = d.vec3f(outsideBase);
  if (dist < 0.0) {
    baseColor = d.vec3f(insideBase);
  }

  const contourFreq = maxDist / 12.0;
  const contour = std.smoothstep(0.0, 0.15, std.abs(std.fract(unsigned / contourFreq) - 0.5));

  const color = baseColor.mul(0.7 + 0.3 * contour);
  return d.vec4f(color, 1.0);
});
