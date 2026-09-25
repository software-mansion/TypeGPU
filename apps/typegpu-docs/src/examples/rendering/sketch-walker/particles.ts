import { d, std, type TgpuRoot } from 'typegpu';
import { randf } from '@typegpu/noise';
import type { Vec3 } from 'math';
import type { Terrain } from './terrain.ts';

export const PARTICLE_COUNT = 2048;
const MAX_BURSTS = 4; // footfalls per frame
const PER_BURST = 20;

export const PUFF = 0;
export const GRIT = 1;

export const Particle = d.struct({
  position: d.vec3f,
  age: d.f32,
  velocity: d.vec3f,
  life: d.f32,
  size: d.f32,
  kind: d.u32,
});

const Burst = d.struct({
  position: d.vec3f,
  strength: d.f32,
});

const SpawnParams = d.struct({
  dt: d.f32,
  time: d.f32,
  // Particles [spawnStart, spawnStart + spawnCount) of the ring buffer get respawned.
  spawnStart: d.u32,
  spawnCount: d.u32,
  bursts: d.arrayOf(Burst, MAX_BURSTS),
});

/**
 * Dust kicked up by footfalls. The CPU only says where a foot landed and how hard;
 * spawning and simulating every particle happens in a compute shader.
 */
export function createParticles(root: TgpuRoot, terrain: Terrain) {
  const buffer = root.createBuffer(d.arrayOf(Particle, PARTICLE_COUNT)).$usage('storage');
  const particles = buffer.as('mutable');
  const params = root.createUniform(SpawnParams);

  const spawn = (index: number) => {
    'use gpu';
    const slot = (index + PARTICLE_COUNT - params.$.spawnStart) % PARTICLE_COUNT;
    const burst = params.$.bursts[d.u32(slot / PER_BURST)];
    randf.seed2(d.vec2f(d.f32(index) / PARTICLE_COUNT, std.fract(params.$.time * 0.1)));

    // Mostly soft puffs rolling outwards along the ground, with a few bits of grit thrown up.
    const kind = std.select(d.u32(PUFF), d.u32(GRIT), randf.sample() < 0.25);
    const around = randf.onUnitCircle();
    const spread = randf.sample();
    const reach = (1.5 + 4 * spread) * (0.5 + burst.strength * 0.8);
    let velocity = d.vec3f(around.x * reach, 0.5 + randf.sample() * 1.5, around.y * reach);
    let size = (0.18 + randf.sample() * 0.22) * (0.6 + burst.strength * 0.5);
    if (kind === GRIT) {
      velocity = d.vec3f(
        velocity.x * 0.7,
        3 + randf.sample() * 4 * burst.strength,
        velocity.z * 0.7,
      );
      size = 0.1 + randf.sample() * 0.08;
    }
    return Particle({
      position: burst.position + d.vec3f(around.x, 0.2, around.y) * (0.6 + spread * 0.8),
      age: 0,
      velocity,
      life: 0.5 + randf.sample() * 0.6,
      size,
      kind,
    });
  };

  const simulate = root.createGuardedComputePipeline((index) => {
    'use gpu';
    if ((index + PARTICLE_COUNT - params.$.spawnStart) % PARTICLE_COUNT < params.$.spawnCount) {
      particles.$[index] = spawn(index);
      return;
    }

    const particle = Particle(particles.$[index]);
    if (particle.age >= particle.life) {
      return;
    }
    const dt = params.$.dt;
    let velocity = d.vec3f(particle.velocity);
    if (particle.kind === PUFF) {
      // Dust drags to a halt and drifts up a little.
      velocity = velocity * std.exp(-3 * dt) + d.vec3f(0, 0.8 * dt, 0);
    } else {
      velocity = velocity + d.vec3f(0, -22 * dt, 0);
    }
    let position = particle.position + velocity * dt;
    const ground = terrain.terrainSample(position.xz).x;
    if (position.y < ground + particle.size * 0.5) {
      position = d.vec3f(position.x, ground + particle.size * 0.5, position.z);
      velocity = d.vec3f(velocity.x * 0.4, std.abs(velocity.y) * 0.2, velocity.z * 0.4);
    }
    particles.$[index] = Particle({
      position,
      age: particle.age + dt,
      velocity,
      life: particle.life,
      size: particle.size,
      kind: particle.kind,
    });
  });

  const bursts = Array.from({ length: MAX_BURSTS }, () => ({
    position: [0, 0, 0] as Vec3,
    strength: 0,
  }));
  let pending = 0;
  let head = 0;

  /** Queues a burst of dust for the next update. */
  function burst(at: Vec3, strength: number) {
    if (pending >= MAX_BURSTS) {
      return;
    }
    const target = bursts[pending++];
    target.position[0] = at[0];
    target.position[1] = at[1];
    target.position[2] = at[2];
    target.strength = strength;
  }

  function update(dt: number, time: number) {
    const spawnCount = pending * PER_BURST;
    params.write({ dt, time, spawnStart: head, spawnCount, bursts });
    simulate.dispatchThreads(PARTICLE_COUNT);
    head = (head + spawnCount) % PARTICLE_COUNT;
    pending = 0;
  }

  return { particles: buffer.as('readonly'), burst, update };
}

export type Particles = ReturnType<typeof createParticles>;
