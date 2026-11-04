export const samples = {
  'Vector math': `import tgpu, { d, std } from 'typegpu';

export const shade = tgpu.fn([d.vec2f], d.vec3f)((uv) => {
  'use gpu';
  const wave = std.sin(uv.x * 6.28);
  const intensity = wave * 0.5 + 0.5;
  return d.vec3f(intensity, uv.y, 1.0);
});`,
  'Function calls': `import tgpu, { d } from 'typegpu';

const square = (x: number) => {
  'use gpu';
  return x * x;
};

export const distanceSquared = tgpu.fn([d.vec2f], d.f32)((p) => {
  'use gpu';
  return square(p.x) + square(p.y);
});`,
  'Branch pruning': `import tgpu, { d } from 'typegpu';

const inverted = true;

export const remap = tgpu.fn([d.f32], d.f32)((value) => {
  'use gpu';
  if (inverted) {
    return 1 - value;
  }
  return value;
});`,
  Loop: `import tgpu, { d } from 'typegpu';

export const accumulate = tgpu.fn([d.f32], d.f32)((value) => {
  'use gpu';
  let total = d.f32(0);
  for (let i = 0; i < 4; i++) {
    total += value;
  }
  return total;
});`,
};
