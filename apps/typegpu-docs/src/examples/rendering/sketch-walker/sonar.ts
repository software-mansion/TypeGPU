import { vec2, vec3, type Vec3, type Vec4 } from 'math';
import { mulberry32 } from 'math/random';
import { coarseHeight } from './terrain.ts';

export const MAX_PULSES = 4;
/** How fast the ring travels, in units per second. */
export const PULSE_SPEED = 45;
/** How long a pulse lasts, in seconds. */
export const PULSE_LIFE = 3.2;
/** How long a point keeps its colour after the ring has passed it, in seconds. */
export const REVEAL_TIME = 0.8;

const COOLDOWN = 1.2;
const FLASH_TIME = 0.35;
const PICKUP_RADIUS = 7;
const RESPAWN_DELAY = 1.5;
const GOAL_DISTANCE = [60, 110];
const ORB_HEIGHT = 5.6;

/**
 * Sonar pulses, and the goal they reveal. All of this is plain CPU state - the renderer
 * only ever sees the arrays below, which go straight into a uniform.
 */
export function createSonar() {
  // [x, y, z, start time] per pulse, reused round-robin.
  const pulses: Vec4[] = Array.from({ length: MAX_PULSES }, () => [0, 0, 0, -1000]);
  const flash: Vec4 = [0, 0, 0, 0];
  const pillar: Vec4 = [0, 0, 0, 0];
  const rng = mulberry32.create(5);

  const goal = {
    position: vec3.create(),
    orb: vec3.create(),
    active: false,
    revealed: false,
    collectedAt: -1000,
  };

  let nextPulse = 0;
  let lastPing = -1000;

  function emit(origin: Vec3, time: number) {
    const pulse = pulses[nextPulse];
    [pulse[0], pulse[1], pulse[2], pulse[3]] = [origin[0], origin[1], origin[2], time];
    nextPulse = (nextPulse + 1) % MAX_PULSES;
  }

  /** Sends a pulse out from `origin`, unless one just went out. */
  function ping(origin: Vec3, time: number) {
    if (time - lastPing < COOLDOWN) {
      return false;
    }
    lastPing = time;
    emit(origin, time);
    return true;
  }

  /** Hides a new goal somewhere on a ring around `center`. */
  function spawnGoal(center: Vec3) {
    const angle = mulberry32.sample(rng) * Math.PI * 2;
    const [near, far] = GOAL_DISTANCE;
    const distance = near + mulberry32.sample(rng) * (far - near);
    const x = center[0] + Math.sin(angle) * distance;
    const z = center[2] + Math.cos(angle) * distance;
    vec3.set(goal.position, x, coarseHeight(x, z), z);
    vec3.set(goal.orb, x, goal.position[1] + ORB_HEIGHT, z);
    goal.active = true;
    goal.revealed = false;
  }

  function update(time: number, dt: number, walker: Vec3, antennaTip: Vec3) {
    if (!goal.active && time - goal.collectedAt > RESPAWN_DELAY) {
      spawnGoal(walker);
    }

    // The goal lights up the moment a ring washes over it, and answers with a pulse of its own.
    if (goal.active && !goal.revealed) {
      for (const pulse of pulses) {
        const age = time - pulse[3];
        const [x, y, z] = pulse;
        const distance = Math.hypot(goal.orb[0] - x, goal.orb[1] - y, goal.orb[2] - z);
        if (age < PULSE_LIFE && age * PULSE_SPEED >= distance) {
          goal.revealed = true;
          emit(goal.orb, time);
          break;
        }
      }
    }

    // Walking up to the goal collects it.
    const reached =
      vec2.distance([walker[0], walker[2]], [goal.position[0], goal.position[2]]) < PICKUP_RADIUS;
    if (goal.active && reached) {
      goal.active = false;
      goal.collectedAt = time;
      emit(goal.orb, time);
    }

    const flashAge = (time - lastPing) / FLASH_TIME;
    [flash[0], flash[1], flash[2]] = [antennaTip[0], antennaTip[1], antennaTip[2]];
    flash[3] = flashAge < 1 ? (1 - flashAge) ** 2 : 0;

    const glow = goal.active && goal.revealed ? 1 : 0;
    [pillar[0], pillar[1], pillar[2]] = [goal.position[0], goal.position[1], goal.position[2]];
    pillar[3] += (glow - pillar[3]) * Math.min(1, dt * 2.5);
  }

  return {
    pulses,
    flash,
    pillar,
    goal,
    ping,
    update,
    get flashing() {
      return flash[3];
    },
  };
}

export type Sonar = ReturnType<typeof createSonar>;
