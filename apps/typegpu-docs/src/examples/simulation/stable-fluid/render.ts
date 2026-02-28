import tgpu, { d, std } from 'typegpu';
import { SIM_N } from './params.ts';

export const renderLayout = tgpu.bindGroupLayout({
  result: { texture: d.texture2d(d.f32) },
  background: { texture: d.texture2d(d.f32) },
  linSampler: { sampler: 'filtering' },
});

export const renderFn = tgpu.vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((input) => {
  const vertices = [d.vec2f(-1, -1), d.vec2f(3, -1), d.vec2f(-1, 3)];
  const texCoords = [d.vec2f(0, 0), d.vec2f(2, 0), d.vec2f(0, 2)];

  return { pos: d.vec4f(vertices[input.idx], 0, 1), uv: texCoords[input.idx] };
});

export const fragmentInkFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const density = std.textureSample(renderLayout.$.result, renderLayout.$.linSampler, input.uv).x;
  return d.vec4f(density, density * 0.8, density * 0.5, d.f32(1.0));
});

export const fragmentVelFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const velocity = std.textureSample(renderLayout.$.result, renderLayout.$.linSampler, input.uv).xy;
  const magnitude = std.length(velocity);
  const outColor = d.vec4f(
    (velocity.x + 1.0) * 0.5,
    (velocity.y + 1.0) * 0.5,
    magnitude * 0.4,
    d.f32(1.0),
  );
  return outColor;
});

export const fragmentImageFn = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const pixelStep = d.f32(1) / SIM_N;

  const leftSample = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(input.uv.x - pixelStep, input.uv.y),
  ).x;
  const rightSample = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(input.uv.x + pixelStep, input.uv.y),
  ).x;
  const upSample = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(input.uv.x, input.uv.y + pixelStep),
  ).x;
  const downSample = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(input.uv.x, input.uv.y - pixelStep),
  ).x;

  const gradientX = rightSample - leftSample;
  const gradientY = upSample - downSample;

  const distortStrength = 0.8;
  const distortVector = d.vec2f(gradientX, gradientY);
  const distortedUV = input.uv + distortVector * d.vec2f(distortStrength, -distortStrength);

  const outputColor = std.textureSample(
    renderLayout.$.background,
    renderLayout.$.linSampler,
    d.vec2f(distortedUV.x, 1.0 - distortedUV.y),
  );

  return d.vec4f(outputColor.rgb, 1.0);
});
