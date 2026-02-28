import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import * as std from '../src/std/index.ts';
import tgpu from '../src/index.js';

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
      const newVelocity = std.mul(particle.velocity, std.mul(gravity, deltaTime));
      const newPosition = std.add(particle.position, std.mul(newVelocity, deltaTime));
      return Particle({
        position: newPosition,
        velocity: newVelocity,
      });
    });

    expect(tgpu.resolve([updateParicle])).toMatchInlineSnapshot(`
      "struct Particle {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParicle(particle: Particle, gravity: vec3f, deltaTime: f32) -> Particle {
        var newVelocity = (particle.velocity * (gravity * deltaTime));
        var newPosition = (particle.position + (newVelocity * deltaTime));
        return Particle(newPosition, newVelocity);
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
      const newVelocity = std.mul(particle.velocity, std.mul(gravity, deltaTime));
      const newPosition = std.add(particle.position, std.mul(newVelocity, deltaTime));
      return Particle({
        position: newPosition,
        velocity: newVelocity,
      });
    });

    const main = tgpu.fn([])(() => {
      for (let i = 0; i < layout.$.systemData.particles.length; i++) {
        const particle = layout.$.systemData.particles[i] as d.Infer<typeof Particle>;
        layout.$.systemData.particles[i] = updateParicle(
          particle,
          layout.$.systemData.gravity,
          layout.$.systemData.deltaTime,
        );
      }
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "struct Particle {
        position: vec3f,
        velocity: vec3f,
      }

      struct SystemData {
        particles: array<Particle, 100>,
        gravity: vec3f,
        deltaTime: f32,
      }

      @group(0) @binding(0) var<storage, read> systemData: SystemData;

      fn updateParicle(particle: Particle, gravity: vec3f, deltaTime: f32) -> Particle {
        var newVelocity = (particle.velocity * (gravity * deltaTime));
        var newPosition = (particle.position + (newVelocity * deltaTime));
        return Particle(newPosition, newVelocity);
      }

      fn main() {
        for (var i = 0; (i < 100i); i++) {
          let particle = (&systemData.particles[i]);
          systemData.particles[i] = updateParicle((*particle), systemData.gravity, systemData.deltaTime);
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
      const newPosition = particle.physics.position.add(newVelocity.mul(deltaTime));
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
        const particle = layout.$.systemData.particles[i] as d.Infer<typeof Particle>;
        layout.$.systemData.particles[i] = updateParticle(
          particle,
          layout.$.systemData.gravity,
          layout.$.systemData.deltaTime,
        );
      }
    });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(2) var<storage, read> counter: u32;

      fn incrementCounter() {
        counter += 1u;
      }

      struct PhysicsData {
        weight: f32,
        velocity: vec3f,
        position: vec3f,
      }

      struct Particle {
        id: u32,
        physics: PhysicsData,
      }

      struct SystemData {
        particles: array<Particle, 100>,
        gravity: vec3f,
        deltaTime: f32,
      }

      @group(0) @binding(0) var<storage, read> systemData: SystemData;

      @group(0) @binding(1) var densityField: texture_storage_3d<r32float, read>;

      fn getDensityAt(position: vec3f) -> f32 {
        return textureLoad(densityField, vec3i(position)).x;
      }

      fn updateParticle(particle: Particle, gravity: vec3f, deltaTime: f32) -> Particle {
        let density = getDensityAt(particle.physics.position);
        var force = (gravity * density);
        var newVelocity = (particle.physics.velocity + (force * deltaTime));
        var newPosition = (particle.physics.position + (newVelocity * deltaTime));
        return Particle(particle.id, PhysicsData(particle.physics.weight, newVelocity, newPosition));
      }

      fn main() {
        incrementCounter();
        for (var i = 0; (i < 100i); i++) {
          let particle = (&systemData.particles[i]);
          systemData.particles[i] = updateParticle((*particle), systemData.gravity, systemData.deltaTime);
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
      const newParticle = Particle(particle);
      if (newParticle.velocity.x > 0) {
        newParticle.position = newParticle.position.add(newParticle.velocity);
      } else {
        newParticle.position = newParticle.position.add(gravity);
      }
      return newParticle;
    });

    expect(tgpu.resolve([updateParticle])).toMatchInlineSnapshot(`
      "struct Particle {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParticle(particle: Particle, gravity: vec3f) -> Particle {
        var newParticle = particle;
        if ((newParticle.velocity.x > 0f)) {
          newParticle.position = (newParticle.position + newParticle.velocity);
        }
        else {
          newParticle.position = (newParticle.position + gravity);
        }
        return newParticle;
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
      const newParticle = Particle(particle);
      let iterations = 0;
      while (iterations < 10) {
        newParticle.position = newParticle.position.add(newParticle.velocity);
        iterations += 1;
        while (newParticle.position.x < 0) {
          newParticle.position = newParticle.position.add(gravity);
        }
      }
      return newParticle;
    });

    expect(tgpu.resolve([updateParticle])).toMatchInlineSnapshot(`
      "struct Particle {
        position: vec3f,
        velocity: vec3f,
      }

      fn updateParticle(particle: Particle, gravity: vec3f) -> Particle {
        var newParticle = particle;
        var iterations = 0;
        while ((iterations < 10i)) {
          newParticle.position = (newParticle.position + newParticle.velocity);
          iterations += 1i;
          while ((newParticle.position.x < 0f)) {
            newParticle.position = (newParticle.position + gravity);
          }
        }
        return newParticle;
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

    const someVertex = tgpu.vertexFn({
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
      for (let i = d.u32(); i < std.floor(std.sin(Math.PI / 2)); i++) {
        const sampled = std.textureSample(layout.$.sampled, layout.$.sampler, d.vec2f(0.5, 0.5), i);
        const someVal = std.textureLoad(layout.$.smoothRender, d.vec2i(), 0);
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

    expect(tgpu.resolve([someVertex])).toMatchInlineSnapshot(`
      "struct UniBoid {
        @size(32) position: vec4f,
        @align(64) velocity: vec4f,
      }

      @group(0) @binding(0) var<uniform> boids: UniBoid;

      @group(0) @binding(3) var sampled: texture_2d_array<f32>;

      @group(0) @binding(4) var sampler_1: sampler;

      @group(0) @binding(2) var smoothRender: texture_multisampled_2d<f32>;

      struct someVertex_Output {
        @builtin(position) position: vec4f,
        @location(0) @interpolate(flat, either) uv: vec2f,
      }

      struct someVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
        @location(0) position: vec4f,
        @location(1) something: vec4f,
      }

      @vertex fn someVertex(input: someVertex_Input) -> someVertex_Output {
        let uniBoid = (&boids);
        for (var i = 0u; (i < 1u); i++) {
          var sampled_1 = textureSample(sampled, sampler_1, vec2f(0.5), i);
          var someVal = textureLoad(smoothRender, vec2i(), 0);
          if (((someVal.x + sampled_1.x) > 0.5f)) {
            var newPos = ((*uniBoid).position + vec4f(1, 2, 3, 4));
          }
          else {
            while (true) {
              var newPos = ((*uniBoid).position + vec4f(1, 2, 3, 4));
              if ((newPos.x > 0f)) {
                var evenNewer = (newPos + input.position);
              }
            }
          }
        }
        return someVertex_Output(input.position, input.something.xy);
      }"
    `);
  });
});
