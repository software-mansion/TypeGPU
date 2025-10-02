import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { Particle, SPHParams } from './copyPosition';

export const RealBoxSize = d.struct({ xHalf: d.f32, yHalf: d.f32, zHalf: d.f32 });

export const makeIntegrate = (
  particles: any,
  realBoxSize: any,
  params: any,
) =>
  tgpu['~unstable'].computeFn({ in: { gid: d.builtin.globalInvocationId }, workgroupSize: [64] })(({ gid }) => {
    if (gid.x >= params.$.n) return;
    const p = particles.$[gid.x];
    if (p.density === 0) return;

    // acceleration
    let a = p.force.div(p.density);

    // wall forces (match original WGSL semantics with half-extents distances)
    const xPlusDist = realBoxSize.$.xHalf - p.position.x;
    const xMinusDist = realBoxSize.$.xHalf + p.position.x;
    const yPlusDist = realBoxSize.$.yHalf - p.position.y;
    const yMinusDist = realBoxSize.$.yHalf + p.position.y;
    const zPlusDist = realBoxSize.$.zHalf - p.position.z;
    const zMinusDist = realBoxSize.$.zHalf + p.position.z;

    const wallStiffness = 8000.0;
    const xPlusForce = d.vec3f(1, 0, 0).mul(wallStiffness * std.min(xPlusDist, 0));
    const xMinusForce = d.vec3f(-1, 0, 0).mul(wallStiffness * std.min(xMinusDist, 0));
    const yPlusForce = d.vec3f(0, 1, 0).mul(wallStiffness * std.min(yPlusDist, 0));
    const yMinusForce = d.vec3f(0, -1, 0).mul(wallStiffness * std.min(yMinusDist, 0));
    const zPlusForce = d.vec3f(0, 0, 1).mul(wallStiffness * std.min(zPlusDist, 0));
    const zMinusForce = d.vec3f(0, 0, -1).mul(wallStiffness * std.min(zMinusDist, 0));
    a = a.add(xPlusForce.add(xMinusForce).add(yPlusForce).add(yMinusForce).add(zPlusForce).add(zMinusForce));

    // integrate
    let v = p.v.add(a.mul(params.$.dt));
    let pos = p.position.add(v.mul(params.$.dt));

    particles.$[gid.x] = Particle({ position: pos, v, force: p.force, density: p.density, nearDensity: p.nearDensity });
  });