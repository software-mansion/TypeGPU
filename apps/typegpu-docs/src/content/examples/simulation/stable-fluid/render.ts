import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { SIM_N } from './params.ts';

export const renderLayout = tgpu.bindGroupLayout({
  result: { texture: 'float' },
  background: { texture: 'float' },
  linSampler: { sampler: 'filtering' },
});

export const renderFn = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((i) => {
  const verts = [
    d.vec4f(-1, -1, 0, 1),
    d.vec4f(1, -1, 0, 1),
    d.vec4f(-1, 1, 0, 1),
    d.vec4f(1, 1, 0, 1),
  ];
  const uvs = [
    d.vec2f(0, 0),
    d.vec2f(1, 0),
    d.vec2f(0, 1),
    d.vec2f(1, 1),
  ];
  return { pos: verts[i.idx], uv: uvs[i.idx] };
});

export const fragmentInkFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((inp) => {
  const dens = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    inp.uv,
  ).x;
  return d.vec4f(dens, dens * 0.8, dens * 0.5, d.f32(1.0));
});

export const fragmentVelFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((inp) => {
  const f = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    inp.uv,
  ).xy;
  const mag = std.length(f);
  const col = d.vec4f(
    (f.x + 1.0) * 0.5,
    (f.y + 1.0) * 0.5,
    mag * 0.4,
    d.f32(1.0),
  );
  return col;
});

export const fragmentImageFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((inp) => {
  const EPS = d.f32(1) / SIM_N;

  const left = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(inp.uv.x - EPS, inp.uv.y),
  ).x;
  const right = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(inp.uv.x + EPS, inp.uv.y),
  ).x;
  const up = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(inp.uv.x, inp.uv.y + EPS),
  ).x;
  const down = std.textureSample(
    renderLayout.$.result,
    renderLayout.$.linSampler,
    d.vec2f(inp.uv.x, inp.uv.y - EPS),
  ).x;

  const dx = right - left;
  const dy = up - down;

  const strength = 0.8;
  const displacement = d.vec2f(dx, dy);
  const offsetUV = std.add(
    inp.uv,
    std.mul(displacement, d.vec2f(strength, -strength)),
  );

  const color = std.textureSample(
    renderLayout.$.background,
    renderLayout.$.linSampler,
    d.vec2f(offsetUV.x, 1.0 - offsetUV.y),
  );

  return d.vec4f(color.xyz, 1.0);
});
