import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const distanceGradient = tgpu.const(d.arrayOf(d.vec3f, 5), [
  d.vec3f(0.05, 0.05, 0.15),
  d.vec3f(0.2, 0.1, 0.4),
  d.vec3f(0.6, 0.2, 0.5),
  d.vec3f(0.95, 0.5, 0.3),
  d.vec3f(1.0, 0.95, 0.8),
]);

export const colorSampleLayout = tgpu.bindGroupLayout({
  floodTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

export const coordSampleLayout = tgpu.bindGroupLayout({
  coordTexture: { texture: d.texture2d() },
  sampler: { sampler: 'filtering' },
});

export const voronoiFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) =>
  std.textureSample(
    colorSampleLayout.$.floodTexture,
    colorSampleLayout.$.sampler,
    uv,
  )
);

export const distanceFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const size = std.textureDimensions(coordSampleLayout.$.coordTexture);
  const seedCoord = std.textureSample(
    coordSampleLayout.$.coordTexture,
    coordSampleLayout.$.sampler,
    uv,
  ).xy;

  if (seedCoord.x < 0) {
    std.discard();
  }

  const pixelPos = uv.mul(d.vec2f(size));
  const seedPos = seedCoord.mul(d.vec2f(size));
  const dist = std.distance(pixelPos, seedPos);

  const maxDist = d.f32(std.max(size.x, size.y)) * 0.15;
  const t = std.saturate(dist / maxDist);

  const gradientPos = t * 4;
  const idx = d.u32(std.floor(gradientPos));
  const frac = std.fract(gradientPos);

  const color = std.mix(
    distanceGradient.$[std.min(idx, 4)],
    distanceGradient.$[std.min(idx + 1, 4)],
    frac,
  );

  const contourFreq = maxDist / 12;
  const contour = std.smoothstep(
    0.0,
    0.15,
    std.abs(std.fract(dist / contourFreq) - 0.5),
  );

  return d.vec4f(color.mul(0.7 + 0.3 * contour), 1);
});
