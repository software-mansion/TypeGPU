import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Particle, SPHParams } from './copyPosition';

export const RealBoxSize = d.struct({ xHalf: d.f32, yHalf: d.f32, zHalf: d.f32 });

export const integrateLayout = tgpu.bindGroupLayout({
  particles: { storage: d.arrayOf(Particle), access: 'mutable' },
  realBox: { uniform: RealBoxSize },
  params: { uniform: SPHParams },
});

const { particles, realBox, params } = integrateLayout.bound;

export const computeIntegrate = tgpu['~unstable'].computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [64] })(({ gid }) => {
  if (gid.x >= params.value.n) return;
  const p = particles.value[gid.x];
  if (p.density === 0) return;

  let a = p.force.div(p.density);

  const xPlusDist = realBox.value.xHalf - p.position.x;
  const xMinusDist = realBox.value.xHalf + p.position.x;
  const yPlusDist = realBox.value.yHalf - p.position.y;
  const yMinusDist = realBox.value.yHalf + p.position.y;
  const zPlusDist = realBox.value.zHalf - p.position.z;
  const zMinusDist = realBox.value.zHalf + p.position.z;

  const wallStiffness = 8000.0;
  const xPlusForce = d.vec3f(1, 0, 0).mul(wallStiffness * std.min(xPlusDist, 0));
  const xMinusForce = d.vec3f(-1, 0, 0).mul(wallStiffness * std.min(xMinusDist, 0));
  const yPlusForce = d.vec3f(0, 1, 0).mul(wallStiffness * std.min(yPlusDist, 0));
  const yMinusForce = d.vec3f(0, -1, 0).mul(wallStiffness * std.min(yMinusDist, 0));
  const zPlusForce = d.vec3f(0, 0, 1).mul(wallStiffness * std.min(zPlusDist, 0));
  const zMinusForce = d.vec3f(0, 0, -1).mul(wallStiffness * std.min(zMinusDist, 0));
  a = a.add(xPlusForce.add(xMinusForce).add(yPlusForce).add(yMinusForce).add(zPlusForce).add(zMinusForce));

  let v = p.v.add(a.mul(params.value.dt));
  let pos = p.position.add(v.mul(params.value.dt));

  particles.value[gid.x] = Particle({ position: pos, v, force: p.force, density: p.density, nearDensity: p.nearDensity });
});