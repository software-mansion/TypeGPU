import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import * as std from '../src/std/index.ts';
import tgpu from '../src/index.ts';

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
      "struct Particle_1 {
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
      "struct Particle_3 {
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
        for (var i = 0; (i < 100); i++) {
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
        storageTexture: d.textureStorage3d('r32float', 'read-only'),
      },
      counter: { storage: d.u32 },
    });

    const getDensityAt = tgpu.fn(
      [d.vec3f],
      d.f32,
    )((position) => {
      return std.textureLoad(layout.$.densityField, d.vec3i(position)).x;
    });

    const incrementCounter = tgpu.fn([])(() => {
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
      incrementCounter();
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
      "@group(0) @binding(2) var<storage, read> counter_2: u32;

      fn incrementCounter_1() {
        counter_2 += 1u;
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
        incrementCounter_1();
        for (var i = 0; (i < 100); i++) {
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
      "struct Particle_1 {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParticle_0(particle: Particle_1, gravity: vec3f) -> Particle_1 {
        if ((particle.velocity.x > 0f)) {
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
        while (particle.position.x < 0) {
          particle.position = std.add(particle.position, gravity);
        }
      }
      return particle;
    });

    const code = tgpu.resolve({ externals: { updateParticle } });
    expect(code).toMatchInlineSnapshot(`
      "struct Particle_1 {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParticle_0(particle: Particle_1, gravity: vec3f) -> Particle_1 {
        var iterations = 0;
        while ((iterations < 10i)) {
          particle.position = (particle.position + particle.velocity);
          iterations += 1i;
          while ((particle.position.x < 0f)) {
            particle.position = (particle.position + gravity);
          }
        }
        return particle;
      }"
    `);
  });

  it('should handle complex shader with a variety of nested constructs', () => {
    const UniBoid = d.struct({
      position: d.size(32, d.vec4f),
      velocity: d.align(64, d.vec4f),
    });

    const layout = tgpu.bindGroupLayout({
      boids: { uniform: UniBoid },
      myCamera: { externalTexture: d.textureExternal() },
      smoothRender: { texture: d.textureMultisampled2d(d.f32) },
      sampled: { texture: d.texture2dArray(d.f32) },
      sampler: { sampler: 'filtering', multisampled: true },
    });

    const someVertex = tgpu['~unstable'].vertexFn({
      in: {
        vertexIndex: d.builtin.vertexIndex,
        position: d.vec4f,
        something: d.vec4f,
      },
      out: {
        position: d.builtin.position,
        uv: d.interpolate('flat, either', d.vec2f),
      },
    })((input) => {
      const uniBoid = layout.$.boids;
      for (let i = d.u32(); i < std.floor(std.sin(123)); i++) {
        const sampled = std.textureSample(
          layout.$.sampled,
          layout.$.sampler,
          d.vec2f(0.5, 0.5),
          i,
        );
        const someVal = std.textureLoad(
          layout.$.smoothRender,
          d.vec2i(),
          0,
        );
        if (someVal.x + sampled.x > 0.5) {
          const newPos = std.add(uniBoid.position, d.vec4f(1, 2, 3, 4));
        } else {
          while (std.allEq(d.vec2f(1, 2), d.vec2f(1, 2))) {
            const newPos = std.add(uniBoid.position, d.vec4f(1, 2, 3, 4));
            if (newPos.x > 0) {
              const evenNewer = std.add(newPos, input.position);
            }
          }
        }
      }
      return {
        position: input.position,
        uv: input.something.xy,
      };
    });

    const code = tgpu.resolve({
      externals: { someVertex },
    });
    expect(code).toMatchInlineSnapshot(`
      "struct UniBoid_2 {
        @size(32) position: vec4f,
        @align(64) velocity: vec4f,
      }

      @group(0) @binding(0) var<uniform> boids_1: UniBoid_2;

      @group(0) @binding(3) var sampled_3: texture_2d_array<f32>;

      @group(0) @binding(4) var sampler_4: sampler;

      @group(0) @binding(2) var smoothRender_5: texture_multisampled_2d<f32>;

      struct someVertex_Output_6 {
        @builtin(position) position: vec4f,
        @location(0) @interpolate(flat, either) uv: vec2f,
      }

      struct someVertex_Input_7 {
        @builtin(vertex_index) vertexIndex: u32,
        @location(0) position: vec4f,
        @location(1) something: vec4f,
      }

      @vertex fn someVertex_0(input: someVertex_Input_7) -> someVertex_Output_6 {
        var uniBoid = boids_1;
        for (var i = 0u; (i < -1u); i++) {
          var sampled = textureSample(sampled_3, sampler_4, vec2f(0.5), i);
          var someVal = textureLoad(smoothRender_5, vec2i(), 0);
          if (((someVal.x + sampled.x) > 0.5f)) {
            var newPos = (uniBoid.position + vec4f(1, 2, 3, 4));
          }
          else {
            while (true) {
              var newPos = (uniBoid.position + vec4f(1, 2, 3, 4));
              if ((newPos.x > 0f)) {
                var evenNewer = (newPos + input.position);
              }
            }
          }
        }
        return someVertex_Output_6(input.position, input.something.xy);
      }"
    `);
  });
});
