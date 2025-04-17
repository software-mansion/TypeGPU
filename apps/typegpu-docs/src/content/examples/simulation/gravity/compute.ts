import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { CelestialBody, celestialBodiesBindGroupLayout } from './schemas.ts';

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
      const dist = std.max(
        std.min(current.radius, other.radius),
        std.distance(current.position, other.position),
      );
      force = std.add(
        force,
        std.mul(
          (current.mass * other.mass) / dist / dist,
          std.normalize(std.sub(other.position, current.position)),
        ),
      );
    }
    let updatedAcceleration = d.vec3f();
    if (current.mass > 0) {
      updatedAcceleration = std.mul(1 / current.mass, force);
    }
    const updatedPosition = std.add(
      current.position,
      std.add(
        std.mul(dt, current.velocity),
        std.mul(dt * dt * 0.5, current._acceleration),
      ),
    );
    const updatedVelocity = std.add(
      current.velocity,
      std.mul(0.5 * dt, std.add(current._acceleration, updatedAcceleration)),
    );

    const updatedCurrent = CelestialBody({
      modelTransformationMatrix: current.modelTransformationMatrix,
      velocity: updatedVelocity,
      position: updatedPosition,
      _acceleration: updatedAcceleration,
      mass: current.mass,
      radius: current.radius,
      textureIndex: current.textureIndex,
    });

    outState.value[input.gid.x] = updatedCurrent;
  })
  .$name('Compute shader');
