import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { CelestialBody, celestialBodiesBindGroupLayout } from './schemas';

const { inState, outState, celestialBodiesCount } =
  celestialBodiesBindGroupLayout.bound;

export const computeShader = tgpu['~unstable']
  .computeFn({
    in: { gid: d.builtin.globalInvocationId },
    workgroupSize: [1],
  })((input) => {
    const current = inState.value[input.gid.x];
    const dt = 0.016;

    let force = d.vec3f();
    for (let i = 0; i < celestialBodiesCount.value; i++) {
      if (d.u32(i) === input.gid.x) {
        continue;
      }
      const other = inState.value[i];
      const dist = std.max(0.1, std.distance(current.position, other.position));
      force = std.add(
        force,
        std.mul(
          (current.mass * other.mass) / dist / dist,
          std.normalize(std.sub(other.position, current.position)),
        ),
      );
    }
    const acceleration = std.mul(1 / current.mass, force);
    const updatedCurrent = CelestialBody({
      position: std.add(current.position, std.mul(dt, current.velocity)),
      velocity: std.add(current.velocity, std.mul(dt, acceleration)),
      mass: current.mass,
      modelTransformationMatrix: current.modelTransformationMatrix,
    });

    outState.value[input.gid.x] = updatedCurrent;
  })
  .$name('Compute shader');
