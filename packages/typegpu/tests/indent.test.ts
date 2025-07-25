import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import * as std from '../src/std/index.ts';
import tgpu from '../src/index.ts';
// import { parse, parseResolved } from './utils/parseResolved.ts';

describe('indents', () => {
  it('should indent sanely', () => {
    const Particle = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
    });

    const updateParicle = tgpu.fn(
      [Particle, d.vec3f, d.f32],
      Particle,
    )((particle, gravity, deltaTime) => {
      const newVelocity = std.mul(
        particle.velocity,
        std.mul(gravity, deltaTime),
      );
      const newPosition = std.add(
        particle.position,
        std.mul(newVelocity, deltaTime),
      );
      return Particle({
        position: newPosition,
        velocity: newVelocity,
      });
    });

    const code = tgpu.resolve({ externals: { updateParicle } });
    expect(code).toMatchInlineSnapshot(`
      "
      struct Particle_1 {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParicle_0(particle: Particle_1, gravity: vec3f, deltaTime: f32) -> Particle_1 {
        var newVelocity = (particle.velocity * (gravity * deltaTime));
        var newPosition = (particle.position + (newVelocity * deltaTime));
        return Particle_1(newPosition, newVelocity);
      }"
    `);
  });

  it('should indent sanely for for loops', () => {
    const Particle = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
    });

    const SystemData = d.struct({
      particles: d.arrayOf(Particle, 100),
      gravity: d.vec3f,
      deltaTime: d.f32,
    });

    const layout = tgpu.bindGroupLayout({
      systemData: { storage: SystemData },
    });

    const updateParicle = tgpu.fn(
      [Particle, d.vec3f, d.f32],
      Particle,
    )((particle, gravity, deltaTime) => {
      const newVelocity = std.mul(
        particle.velocity,
        std.mul(gravity, deltaTime),
      );
      const newPosition = std.add(
        particle.position,
        std.mul(newVelocity, deltaTime),
      );
      return Particle({
        position: newPosition,
        velocity: newVelocity,
      });
    });

    const main = tgpu.fn([])(() => {
      for (let i = 0; i < layout.$.systemData.particles.length; i++) {
        const particle = layout.$.systemData.particles[i] as d.Infer<
          typeof Particle
        >;
        layout.$.systemData.particles[i] = updateParicle(
          particle,
          layout.$.systemData.gravity,
          layout.$.systemData.deltaTime,
        );
      }
    });

    const code = tgpu.resolve({
      externals: { main },
    });

    expect(code).toMatchInlineSnapshot(`
      "
      struct Particle_3 {
        position: vec3f,
        velocity: vec3f,
      }

      struct SystemData_2 {
        particles: array<Particle_3, 100>,
        gravity: vec3f,
        deltaTime: f32,
      }

      @group(0) @binding(0) var<storage, read> systemData_1: SystemData_2;

      fn updateParicle_4(particle: Particle_3, gravity: vec3f, deltaTime: f32) -> Particle_3 {
        var newVelocity = (particle.velocity * (gravity * deltaTime));
        var newPosition = (particle.position + (newVelocity * deltaTime));
        return Particle_3(newPosition, newVelocity);
      }

      fn main_0() {
        for ( var i = 0; (i < 100); i++) {
          var particle = systemData_1.particles[i];
          systemData_1.particles[i] = updateParicle_4(particle, systemData_1.gravity, systemData_1.deltaTime);
        }
      }"
    `);
  });

  it('should indent sanely for nested loops and complex structures', () => {
    const PhysicsData = d.struct({
      weight: d.f32,
      velocity: d.vec3f,
      position: d.vec3f,
    });

    const Particle = d.struct({
      id: d.u32,
      physics: PhysicsData,
    });

    const SystemData = d.struct({
      particles: d.arrayOf(Particle, 100),
      gravity: d.vec3f,
      deltaTime: d.f32,
    });

    const layout = tgpu.bindGroupLayout({
      systemData: { storage: SystemData },
      densityField: {
        storageTexture: 'r32float',
        access: 'readonly',
        viewDimension: '3d',
      },
      counter: { storage: d.u32 },
    });

    const getDensityAt = tgpu.fn(
      [d.vec3f],
      d.f32,
    )((position) => {
      return std.textureLoad(layout.$.densityField, d.vec3i(position)).x;
    });

    const incrementCouner = tgpu.fn([])(() => {
      layout.$.counter += 1;
    });

    const updateParticle = tgpu.fn(
      [Particle, d.vec3f, d.f32],
      Particle,
    )((particle, gravity, deltaTime) => {
      const density = getDensityAt(particle.physics.position);
      const force = std.mul(gravity, density);
      const newVelocity = particle.physics.velocity.add(force.mul(deltaTime));
      const newPosition = particle.physics.position.add(
        newVelocity.mul(deltaTime),
      );
      return Particle({
        id: particle.id,
        physics: PhysicsData({
          weight: particle.physics.weight,
          velocity: newVelocity,
          position: newPosition,
        }),
      });
    });

    const main = tgpu.fn([])(() => {
      incrementCouner();
      for (let i = 0; i < layout.$.systemData.particles.length; i++) {
        const particle = layout.$.systemData.particles[i] as d.Infer<
          typeof Particle
        >;
        layout.$.systemData.particles[i] = updateParticle(
          particle,
          layout.$.systemData.gravity,
          layout.$.systemData.deltaTime,
        );
      }
    });

    const code = tgpu.resolve({
      externals: { main },
    });

    expect(code).toMatchInlineSnapshot(`
      "
      @group(0) @binding(2) var<storage, read> counter_2: u32;

      fn incrementCouner_1() {
        counter_2 += 1;
      }

      struct PhysicsData_6 {
        weight: f32,
        velocity: vec3f,
        position: vec3f,
      }

      struct Particle_5 {
        id: u32,
        physics: PhysicsData_6,
      }

      struct SystemData_4 {
        particles: array<Particle_5, 100>,
        gravity: vec3f,
        deltaTime: f32,
      }

      @group(0) @binding(0) var<storage, read> systemData_3: SystemData_4;

      @group(0) @binding(1) var densityField_9: texture_storage_3d<r32float, read>;

      fn getDensityAt_8(position: vec3f) -> f32 {
        return textureLoad(densityField_9, vec3i(position)).x;
      }

      fn updateParticle_7(particle: Particle_5, gravity: vec3f, deltaTime: f32) -> Particle_5 {
        var density = getDensityAt_8(particle.physics.position);
        var force = (gravity * density);
        var newVelocity = (particle.physics.velocity + (force * deltaTime));
        var newPosition = (particle.physics.position + (newVelocity * deltaTime));
        return Particle_5(particle.id, PhysicsData_6(particle.physics.weight, newVelocity, newPosition));
      }

      fn main_0() {
        incrementCouner_1();
        for ( var i = 0; (i < 100); i++) {
          var particle = systemData_3.particles[i];
          systemData_3.particles[i] = updateParticle_7(particle, systemData_3.gravity, systemData_3.deltaTime);
        }
      }"
    `);
  });

  it('should indent sanely for conditionals', () => {
    const Particle = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
    });

    const updateParticle = tgpu.fn(
      [Particle, d.vec3f],
      Particle,
    )((particle, gravity) => {
      if (particle.velocity.x > 0) {
        particle.position = std.add(particle.position, particle.velocity);
      } else {
        particle.position = std.add(particle.position, gravity);
      }
      return particle;
    });

    const code = tgpu.resolve({ externals: { updateParticle } });
    expect(code).toMatchInlineSnapshot(`
      "
      struct Particle_1 {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParticle_0(particle: Particle_1, gravity: vec3f) -> Particle_1 {
        if ((particle.velocity.x > 0)) {
          particle.position = (particle.position + particle.velocity);
        }
        else {
          particle.position = (particle.position + gravity);
        }
        return particle;
      }"
    `);
  });

  it('should indent sanely for while loops', () => {
    const Particle = d.struct({
      position: d.vec3f,
      velocity: d.vec3f,
    });

    const updateParticle = tgpu.fn(
      [Particle, d.vec3f],
      Particle,
    )((particle, gravity) => {
      let iterations = 0;
      while (iterations < 10) {
        particle.position = std.add(particle.position, particle.velocity);
        iterations += 1;
      }
      return particle;
    });

    const code = tgpu.resolve({ externals: { updateParticle } });
    expect(code).toMatchInlineSnapshot(`
      "
      struct Particle_1 {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParticle_0(particle: Particle_1, gravity: vec3f) -> Particle_1 {
        var iterations = 0;
        while ((iterations < 10)) {
          particle.position = (particle.position + particle.velocity);
          iterations += 1;
        }
        return particle;
      }"
    `);
  });
});
