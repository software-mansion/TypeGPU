import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { vec3, type Vec3, type Vec4 } from 'math';
import { mulberry32, random } from 'math/random';
import { COLLIDER_COUNT } from './rig.ts';
import type { Terrain } from './terrain.ts';

export const BIRD_COUNT = 120;

const SEPARATION_RADIUS = 2.8;
const VIEW_RADIUS = 7;
const MIN_SPEED = 7;
const MAX_SPEED = 13;
const MAX_FORCE = 32;
const GROUND_CLEARANCE = 7;

export const Bird = d.struct({
  position: d.vec3f,
  phase: d.f32, // wing-flap offset, so the flock doesn't flap in unison
  velocity: d.vec3f,
  bank: d.f32, // how far the bird rolls into its turn
});

const FlockParams = d.struct({
  goal: d.vec3f,
  dt: d.f32,
  // The line of sight from the camera to the walker, which birds keep clear of.
  sightStart: d.vec3f,
  sightEnd: d.vec3f,
  // Spheres around the walker's body (xyz = center, w = radius) for birds to dodge.
  colliders: d.arrayOf(d.vec4f, COLLIDER_COUNT),
});

// #region Mesh

export const BirdVertex = d.struct({
  position: d.vec3f,
  wing: d.f32, // 0 at the body, 1 at the wingtip
});

export const birdLayout = tgpu.vertexLayout(d.arrayOf(BirdVertex));

/** A doodled bird, facing +Z: a slim body and two bent wings. */
function buildBirdMesh() {
  const vertices: { position: Vec3; wing: number }[] = [];
  const tri = (a: Vec3, b: Vec3, c: Vec3) => {
    for (const p of [a, b, c]) {
      vertices.push({ position: p, wing: Math.min(1, Math.abs(p[0]) / 0.9) });
    }
  };
  // Body and tail
  tri([0, 0, 0.5], [0.09, 0, -0.05], [-0.09, 0, -0.05]);
  tri([0.09, 0, -0.05], [0, 0, -0.5], [-0.09, 0, -0.05]);
  tri([0.08, 0, -0.4], [0.2, 0, -0.55], [0, 0, -0.5]);
  tri([-0.08, 0, -0.4], [0, 0, -0.5], [-0.2, 0, -0.55]);
  for (const s of [1, -1]) {
    // Inner and outer wing panels, swept back at the "elbow".
    tri([0.08 * s, 0, 0.15], [0.45 * s, 0, 0.12], [0.08 * s, 0, -0.12]);
    tri([0.08 * s, 0, -0.12], [0.45 * s, 0, 0.12], [0.42 * s, 0, -0.1]);
    tri([0.45 * s, 0, 0.12], [0.95 * s, 0, -0.2], [0.42 * s, 0, -0.1]);
  }
  return vertices;
}

// #endregion

export function createBirds(root: TgpuRoot, terrain: Terrain, spawn: Vec3) {
  const mesh = buildBirdMesh();
  const meshBuffer = root.createBuffer(d.arrayOf(BirdVertex, mesh.length), mesh).$usage('vertex');

  // Scatter the flock around its starting point, with seeded randomness from `math/random`.
  const rng = mulberry32.create(11);
  const sample = () => mulberry32.sample(rng);
  const initial = Array.from({ length: BIRD_COUNT }, () => {
    const offset = vec3.scale(vec3.create(), random.vec3(vec3.create(), sample), 8 * sample());
    return {
      position: vec3.add(offset, offset, spawn),
      phase: sample() * Math.PI * 2,
      velocity: vec3.scale(vec3.create(), random.vec3(vec3.create(), sample), MIN_SPEED),
      bank: 0,
    };
  });

  const current = root.createBuffer(d.arrayOf(Bird, BIRD_COUNT), initial).$usage('storage');
  const next = root.createBuffer(d.arrayOf(Bird, BIRD_COUNT)).$usage('storage');
  const birds = current.as('readonly');
  const nextBirds = next.as('mutable');
  const params = root.createUniform(FlockParams);

  const avoidTerrain = (position: d.v3f, velocity: d.v3f) => {
    'use gpu';
    // Look at the ground under the bird, and a moment ahead of it.
    const below = terrain.terrainSample(position.xz).x;
    const ahead = terrain.terrainSample((position + velocity * 0.8).xz).x;
    const clearance = position.y - std.max(below, ahead);
    return d.vec3f(0, std.max(0, GROUND_CLEARANCE - clearance) * 4, 0);
  };

  const avoidWalker = (position: d.v3f, velocity: d.v3f) => {
    'use gpu';
    const predicted = position + velocity * 0.3;
    let push = d.vec3f();
    for (const i of tgpu.unroll(std.range(COLLIDER_COUNT))) {
      const collider = params.$.colliders[i];
      const away = predicted - collider.xyz;
      const distance = std.max(std.length(away), 0.01);
      const reach = collider.w + 2.5;
      if (collider.w > 0 && distance < reach) {
        push += (away / distance) * ((reach - distance) / reach) * 70;
      }
    }
    // Keep out of the camera's view of the walker, so the flock frames it instead of hiding it.
    const sight = params.$.sightEnd - params.$.sightStart;
    const along = std.saturate(
      std.dot(predicted - params.$.sightStart, sight) / std.dot(sight, sight),
    );
    const off = predicted - (params.$.sightStart + sight * along);
    const offDistance = std.max(std.length(off), 0.01);
    const corridor = 3 + along * 3;
    if (offDistance < corridor) {
      push += (off / offDistance) * ((corridor - offDistance) / corridor) * 60;
    }
    return push;
  };

  /** One boid per thread: the classic separation, alignment and cohesion, plus obstacles. */
  const simulate = root.createGuardedComputePipeline((index) => {
    'use gpu';
    const self = Bird(birds.$[index]);

    let separation = d.vec3f();
    let alignment = d.vec3f();
    let center = d.vec3f();
    let neighbors = d.f32(0);
    for (const other of std.range(BIRD_COUNT)) {
      if (d.u32(other) === index) {
        continue;
      }
      const bird = birds.$[other];
      const offset = bird.position - self.position;
      const distance = std.length(offset);
      if (distance < SEPARATION_RADIUS) {
        separation -= offset / std.max(distance * distance, 0.05);
      }
      if (distance < VIEW_RADIUS) {
        alignment += bird.velocity;
        center += bird.position;
        neighbors += 1;
      }
    }

    let force = separation * 14;
    if (neighbors > 0) {
      force += (alignment / neighbors - self.velocity) * 1.2;
      force += (center / neighbors - self.position) * 0.8;
    }
    // Chase the flight path, so the flock sweeps past the walker every so often.
    const toGoal = params.$.goal - self.position;
    force += (std.normalize(toGoal) * MAX_SPEED - self.velocity) * 0.9;
    force += avoidTerrain(self.position, self.velocity);
    force += avoidWalker(self.position, self.velocity);

    const strength = std.length(force);
    if (strength > MAX_FORCE) {
      force = (force / strength) * MAX_FORCE;
    }

    const dt = params.$.dt;
    let velocity = self.velocity + force * dt;
    const speed = std.max(std.length(velocity), 0.01);
    velocity = (velocity / speed) * std.clamp(speed, MIN_SPEED, MAX_SPEED);

    // Bank into turns: roll by how much of the force pushes sideways.
    const forward = velocity / std.length(velocity);
    const right = std.normalize(std.cross(forward, d.vec3f(0, 1, 0)));
    const bank = std.mix(self.bank, std.clamp(std.dot(force, right) * 0.04, -1, 1), 0.1);

    nextBirds.$[index] = Bird({
      position: self.position + velocity * dt,
      phase: self.phase,
      velocity,
      bank,
    });
  });

  function update(dt: number, goal: Vec3, colliders: Vec4[], camera: Vec3, focus: Vec3) {
    params.write({ goal, dt, sightStart: camera, sightEnd: focus, colliders });
    simulate.dispatchThreads(BIRD_COUNT);
    current.copyFrom(next);
  }

  return { meshBuffer, vertexCount: mesh.length, birds, update };
}

export type Birds = ReturnType<typeof createBirds>;
