// Sanity check for STRIP=1: calls 'use gpu' functions on the CPU and resolves them to WGSL.
// Build both with and without STRIP and compare the printed output.
import { tgpu, d, std } from 'typegpu';
import * as sdf from '@typegpu/sdf';

const config = { scale: 2, nested: { offset: d.vec2f(1, -1) } };

const Particle = d.struct({ pos: d.vec2f, vel: d.vec2f });

const step = (p: d.Infer<typeof Particle>, dt: number) => {
  'use gpu';
  const vel = p.vel * config.scale;
  return Particle({ pos: p.pos + vel * dt + config.nested.offset, vel });
};

function sum(n: number) {
  'use gpu';
  let acc = d.f32(0);
  for (let i = 0; i < n; i++) {
    acc += std.sin(d.f32(i)) * 0.5;
  }
  return acc;
}

const shaped = tgpu.fn(
  [d.vec2f],
  d.f32,
)((p) => {
  let r = sdf.sdDisk(p, 0.5);
  if (r > 0) {
    r = std.min(r, sdf.sdBox2d(p, d.vec2f(0.25)));
  }
  return r;
});

const destructured = ({ pos, vel: v }: d.Infer<typeof Particle>) => {
  'use gpu';
  return std.dot(pos, v);
};

const p = Particle({ pos: d.vec2f(1, 2), vel: d.vec2f(0.5, -0.25) });
const out = {
  step: step(p, 0.1),
  sum: sum(5),
  shaped: shaped(d.vec2f(0.3, 0.4)),
  destructured: destructured(p),
};
const wgsl = tgpu.resolve([
  shaped,
  tgpu.fn([Particle, d.f32], Particle)(step),
  tgpu.fn([d.i32], d.f32)(sum),
]);
console.log(JSON.stringify(out));
console.log(wgsl);
// TypeGPU relies on `.length` (e.g. guarded compute pipelines), so stubs must preserve it
const kernel = (x: number, y: number) => {
  'use gpu';
  return x + y;
};
console.log('arity', step.length, sum.length, destructured.length, kernel.length, kernel(2, 3));
