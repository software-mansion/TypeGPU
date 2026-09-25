import {
  clamp,
  lerp,
  mat3,
  quat,
  vec2,
  vec3,
  type Quat,
  type Vec2,
  type Vec3,
  type Vec4,
} from 'math';
import { fabrik3 } from 'math/ik';
import { mulberry32 } from 'math/random';
import { easing, spring, spring2, spring3 } from 'math/time';
import type { ShapeName } from './geometry.ts';
import type { Terrain } from './terrain.ts';

// #region Parts

export const Material = {
  paper: 0,
  light: 1,
  mid: 2,
  dark: 3,
  accent: 4,
} as const;

/**
 * One rigid piece of the robot. Every field is a plain `math` tuple, which is exactly
 * what TypeGPU accepts when writing to a buffer - no conversion step needed.
 */
export interface Part {
  rotation: Quat;
  position: Vec3;
  material: number;
  scale: Vec3;
}

function createPartRegistry() {
  const byShape: Record<ShapeName, Part[]> = {
    chamfer: [],
    cylinder: [],
    sphere: [],
    chest: [],
    helmet: [],
    toe: [],
  };
  const add = (shape: ShapeName, material: number, scale: Vec3): Part => {
    const part: Part = { rotation: quat.create(), position: vec3.create(), material, scale };
    byShape[shape].push(part);
    return part;
  };
  return { byShape, add };
}

// #endregion

// #region Tuning

// Slower speeds (like easing into a tap-to-walk target) blend down towards a stroll.
const STROLL_SPEED = 3.2;
const WALK_SPEED = 6.6;
const SPRINT_SPEED = 18;
const RIDE_HEIGHT = 6.0; // pelvis above the ground
const HIP: Vec3 = [1.0, -0.35, 0];
const FOOT_SPREAD = 1.2;
const ANKLE_LIFT = 0.55;
const THIGH = 3.0;
const SHIN = 3.0;
const CHEST: Vec3 = [0, 2.7, -0.1]; // relative to the pelvis
const SHOULDER: Vec3 = [1.95, 1.0, 0]; // relative to the chest
const NECK: Vec3 = [0, 1.75, 0.2]; // relative to the chest
const UPPER_ARM = 2.4;
const FOREARM = 2.4;
const ARM_REACH = UPPER_ARM + FOREARM;
const DEG = Math.PI / 180;
/** Head, chest, pelvis, and shoulders, elbows, hands and knees on both sides. */
export const COLLIDER_COUNT = 11;

// #endregion

// #region Scratch space (everything below runs every frame, so nothing allocates)

const UP: Vec3 = [0, 1, 0];
const _m3 = mat3.create();
const _x = vec3.create();
const _y = vec3.create();
const _z = vec3.create();
const _q = quat.create();
const _v = vec3.create();
const _w = vec3.create();

/** Rotation whose local +Y points along `y`, and local +Z points as close to `zHint` as possible. */
function orient(out: Quat, y: Vec3, zHint: Vec3): Quat {
  vec3.normalize(_y, y);
  vec3.normalize(_x, vec3.cross(_x, _y, zHint));
  vec3.cross(_z, _x, _y);
  mat3.set(_m3, _x[0], _x[1], _x[2], _y[0], _y[1], _y[2], _z[0], _z[1], _z[2]);
  return quat.normalize(out, quat.fromMat3(out, _m3));
}

function attachPoint(out: Vec3, pos: Vec3, rot: Quat, offset: Vec3) {
  return vec3.add(out, pos, vec3.transformQuat(out, offset, rot));
}

/** Places `part` at `offset` in the frame of (`pos`, `rot`), with an optional extra local rotation. */
function attach(part: Part, pos: Vec3, rot: Quat, offset: Vec3, local?: Quat) {
  attachPoint(part.position, pos, rot, offset);
  if (local) {
    quat.multiply(part.rotation, rot, local);
  } else {
    quat.copy(part.rotation, rot);
  }
}

/** Stretches `part` between two points, with its local X along `axis`. */
function span(part: Part, start: Vec3, end: Vec3, axis: Vec3, extra = 0) {
  vec3.sub(_v, end, start);
  vec3.lerp(part.position, start, end, 0.5);
  orient(part.rotation, _v, vec3.cross(_w, axis, _v));
  part.scale[1] = vec3.length(_v) + extra;
}

/** The shortest signed turn from one heading to another. */
function deltaYaw(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

const VENT_TILT = quat.setAxisAngle(quat.create(), [1, 0, 0], -30 * DEG);

// #endregion

// #region Limbs (FABRIK from `math/ik`)

interface Limb {
  chain: fabrik3.Chain3;
  /** The axis the middle joint bends around, updated by every solve. */
  axis: Vec3;
}

function createLimb(lengths: [number, number]): Limb {
  const chain = fabrik3.createChain3();
  chain.maxIterations = 12;
  chain.solveDistanceThreshold = 0.002;
  fabrik3.addBone(chain, [0, 0, 0], [0, -lengths[0], 0]);
  fabrik3.addBone(chain, [0, -lengths[0], 0], [0, -lengths[0] - lengths[1], 0]);
  return { chain, axis: vec3.fromValues(1, 0, 0) };
}

const _dir = vec3.create();
const _seed = vec3.create();

/**
 * Solves a two-bone limb so its middle joint (knee, elbow) bends towards `pole`.
 *
 * FABRIK moves the chain as little as it can, so we start every solve from a pose that is
 * already bent the right way, and the solution keeps that bend.
 */
function solveLimb(limb: Limb, base: Vec3, target: Vec3, pole: Vec3) {
  const { chain } = limb;
  vec3.normalize(_dir, vec3.sub(_dir, target, base));
  vec3.cross(limb.axis, _dir, pole);
  if (vec3.squaredLength(limb.axis) < 1e-6) {
    vec3.perpendicular(limb.axis, _dir);
  }
  vec3.normalize(limb.axis, limb.axis);

  let start = base;
  for (let i = 0; i < 2; i++) {
    const bone = chain.bones[i];
    quat.setAxisAngle(_q, limb.axis, i === 0 ? 40 * DEG : -40 * DEG);
    vec3.transformQuat(_seed, _dir, _q);
    vec3.copy(bone.start, start);
    vec3.scaleAndAdd(bone.end, bone.start, _seed, bone.length);
    start = bone.end;
  }
  fabrik3.setBaseLocation(chain, base);
  fabrik3.solve(chain, target);
}

// #endregion

interface Leg {
  side: 1 | -1;
  limb: Limb;
  foot: Vec3;
  normal: Vec3;
  yaw: number;
  swing: number; // 0..1 while stepping, -1 while planted
  from: Vec3;
  to: Vec3;
  fromNormal: Vec3;
  toNormal: Vec3;
  fromYaw: number;
  hip: Vec3;
  ankle: Vec3;
  parts: Record<
    'hipJoint' | 'thigh' | 'knee' | 'kneeCap' | 'shin' | 'ankleJoint' | 'foot' | 'toe',
    Part
  >;
}

interface Arm {
  side: 1 | -1;
  limb: Limb;
  shoulder: Vec3;
  hand: ReturnType<typeof spring3.create>;
  parts: Record<'pauldron' | 'shoulderJoint' | 'upperArm' | 'elbow' | 'forearm' | 'hand', Part>;
}

export interface RigInput {
  /** Desired walking direction on the XZ plane, with length in [0, 1]. */
  direction: Vec2;
  run: boolean;
}

export function createRig(terrain: Terrain, onStomp: (strength: number, at: Vec3) => void) {
  const { byShape, add } = createPartRegistry();
  const rng = mulberry32.create(3);

  // #region Body state, all driven by `math/time` springs

  const position = vec3.fromValues(0, terrain.heightAt(0, 0) + RIDE_HEIGHT, 0);
  const velocity = spring2.create([0, 0]);
  const heading = spring.create(0);
  // Where the head looks. It snaps towards the direction of travel much faster than the body turns.
  const gaze = spring.create(0);
  const height = spring.create(position[1]);
  const weightShift = spring.create(0);
  const lean = spring2.create([0, 0]); // [pitch, roll]
  const twist = spring.create(0);
  const balance = spring.create(0);
  const antennaTip = spring3.create([0, position[1] + 9, 0]);

  const pelvisRotation = quat.create();
  const chestRotation = quat.create();
  const headRotation = quat.create();
  const pelvisPosition = vec3.create();
  const chestPosition = vec3.create();
  const headPosition = vec3.create();
  const forward = vec3.create();
  const sideways = vec3.create();

  let time = 0;
  let lastLanding = 0;
  let nextLeg = 0;
  let previousHeading = 0;
  let previousForwardSpeed = 0;
  let accelerationPitch = 0;
  let turnLean = 0;

  // #endregion

  // #region Parts

  const body = {
    pelvis: add('chamfer', Material.mid, [2.5, 1.1, 1.6]),
    waist: add('cylinder', Material.dark, [1.4, 1.5, 1.2]),
    chest: add('chest', Material.light, [4.0, 3.1, 2.6]),
    chestPlate: add('chamfer', Material.mid, [1.8, 1.0, 0.5]),
    backpack: add('chamfer', Material.mid, [2.8, 2.4, 1.2]),
    vents: [
      add('cylinder', Material.dark, [0.5, 1.0, 0.5]),
      add('cylinder', Material.dark, [0.5, 1.0, 0.5]),
    ],
    neck: add('cylinder', Material.dark, [0.7, 0.8, 0.7]),
    head: add('helmet', Material.light, [1.5, 1.35, 1.7]),
    visor: add('chamfer', Material.accent, [1.25, 0.24, 0.2]),
    mast: add('cylinder', Material.dark, [0.1, 2.4, 0.1]),
    beacon: add('sphere', Material.accent, [0.3, 0.3, 0.3]),
  };

  const marker = {
    pole: add('cylinder', Material.dark, [0, 0, 0]),
    flag: add('chamfer', Material.accent, [0, 0, 0]),
  };

  // A standing stone with a glowing orb above it: the goal sonar pulses reveal.
  const goalParts = {
    base: add('chamfer', Material.dark, [0, 0, 0]),
    stone: add('chamfer', Material.light, [0, 0, 0]),
    orb: add('sphere', Material.accent, [0, 0, 0]),
  };
  const STONE_TILT = quat.setAxisAngle(quat.create(), [0, 0, 1], 0.08);

  const legs: Leg[] = ([-1, 1] as const).map((side) => {
    const foot = vec3.fromValues(FOOT_SPREAD * side, 0, 0);
    foot[1] = terrain.heightAt(foot[0], foot[2]);
    return {
      side,
      limb: createLimb([THIGH, SHIN]),
      foot,
      normal: vec3.clone(UP),
      yaw: 0,
      swing: -1,
      from: vec3.create(),
      to: vec3.create(),
      fromNormal: vec3.create(),
      toNormal: vec3.create(),
      fromYaw: 0,
      hip: vec3.create(),
      ankle: vec3.create(),
      parts: {
        hipJoint: add('sphere', Material.dark, [1.2, 1.2, 1.2]),
        thigh: add('chamfer', Material.mid, [1.0, 1, 1.15]),
        knee: add('cylinder', Material.dark, [0.95, 1.2, 0.95]),
        kneeCap: add('chamfer', Material.light, [0.85, 1.0, 0.4]),
        shin: add('chamfer', Material.light, [1.05, 1, 1.2]),
        ankleJoint: add('sphere', Material.dark, [0.8, 0.8, 0.8]),
        foot: add('chamfer', Material.dark, [1.15, 0.5, 2.0]),
        toe: add('toe', Material.mid, [1.05, 0.42, 0.8]),
      },
    };
  });

  const arms: Arm[] = ([-1, 1] as const).map((side) => ({
    side,
    limb: createLimb([UPPER_ARM, FOREARM]),
    shoulder: vec3.create(),
    hand: spring3.create([side * 2.4, position[1] - 1, 0]),
    parts: {
      pauldron: add('chamfer', Material.mid, [1.5, 1.1, 1.8]),
      shoulderJoint: add('sphere', Material.dark, [1.05, 1.05, 1.05]),
      upperArm: add('chamfer', Material.mid, [0.75, 1, 0.8]),
      elbow: add('cylinder', Material.dark, [0.75, 0.9, 0.75]),
      forearm: add('chamfer', Material.light, [0.95, 1, 1.0]),
      hand: add('chamfer', Material.dark, [0.75, 0.95, 0.55]),
    },
  }));

  // #endregion

  // #region Gait

  /** Where a foot would like to stand, `lead` seconds into the future. */
  function footTarget(out: Vec3, leg: Leg, lead: number) {
    const vel = velocity.value;
    out[0] = position[0] + sideways[0] * FOOT_SPREAD * leg.side + vel[0] * lead;
    out[2] = position[2] + sideways[2] * FOOT_SPREAD * leg.side + vel[1] * lead;
    out[1] = terrain.heightAt(out[0], out[2]);
    return out;
  }

  function startStep(leg: Leg) {
    leg.swing = 0;
    vec3.copy(leg.from, leg.foot);
    vec3.copy(leg.fromNormal, leg.normal);
    leg.fromYaw = leg.yaw;
  }

  function updateGait(
    dt: number,
    speed: number,
    stepTime: number,
    runFactor: number,
    sprintFactor: number,
  ) {
    const swinging = legs.filter((leg) => leg.swing >= 0);

    if (swinging.length === 1 && sprintFactor > 0.2 && speed > 0.3) {
      // Sprinting: the planted foot pushes off before the other one lands, so for a moment
      // both feet are in the air. Overlapping the last 29% of each step leaves the walker
      // airborne for about 40% of its stride.
      const flight = 0.29 * sprintFactor;
      if (swinging[0].swing >= 1 - flight) {
        const planted = legs.indexOf(swinging[0]) === 0 ? 1 : 0;
        startStep(legs[planted]);
        nextLeg = 1 - planted;
      }
    }

    if (swinging.length === 0) {
      const moving = speed > 0.3;
      const errors = legs.map((leg) => {
        footTarget(_v, leg, 0);
        return Math.hypot(leg.foot[0] - _v[0], leg.foot[2] - _v[2]);
      });
      // Alternate feet while walking; when idle, fix whichever foot is furthest off.
      let pick = moving ? nextLeg : errors[0] > errors[1] ? 0 : 1;
      if (moving && errors[pick] < 0.3 && errors[1 - pick] > errors[pick]) {
        pick = 1 - pick;
      }
      const rested = time - lastLanding > lerp(0.08, 0, runFactor);
      if (rested && errors[pick] > (moving ? 0.25 : 0.4)) {
        startStep(legs[pick]);
        nextLeg = 1 - pick;
      }
    }

    for (const leg of legs) {
      if (leg.swing < 0) {
        continue;
      }
      leg.swing = Math.min(1, leg.swing + dt / stepTime);
      const t = leg.swing;

      // Keep re-aiming until late in the step, so the foot follows changes of direction.
      if (t < 0.8) {
        // Walking plants the foot half a step ahead. Sprinting covers ground with long, slow
        // bounds instead, so the foot lands just ahead of the hip and the flight does the rest.
        const landingLead = speed > 0.3 ? lerp(stepTime * 0.5, 0.16, sprintFactor) : 0;
        footTarget(leg.to, leg, stepTime * (1 - t) + landingLead);
        terrain.normalAt(leg.toNormal, leg.to[0], leg.to[2]);
      }

      const glide = easing.sineInOut(t);
      vec3.lerp(leg.foot, leg.from, leg.to, glide);
      const ground = terrain.heightAt(leg.foot[0], leg.foot[2]);
      const liftHeight = lerp(0.9, 1.4, runFactor) + 1.1 * sprintFactor;
      const lift = liftHeight * Math.sin(Math.PI * easing.sineOut(t));
      leg.foot[1] = Math.max(leg.foot[1], ground) + lift;
      vec3.slerp(leg.normal, leg.fromNormal, leg.toNormal, glide);
      leg.yaw = leg.fromYaw + deltaYaw(leg.fromYaw, heading.value) * glide;

      if (t >= 1) {
        leg.swing = -1;
        vec3.copy(leg.foot, leg.to);
        vec3.copy(leg.normal, leg.toNormal);
        lastLanding = time;
        const strength = 0.3 + 0.7 * Math.min(1, speed / SPRINT_SPEED);
        height.velocity -= 2.0 * strength;
        // Stepping up or down knocks the body off balance.
        const drop = leg.to[1] - leg.from[1];
        const wobble = clamp(Math.abs(drop) * 0.3, 0, 0.4);
        lean.velocity[0] += clamp(-drop * 0.25, -0.4, 0.4);
        lean.velocity[1] += wobble * (mulberry32.sample(rng) < 0.5 ? -1 : 1);
        onStomp(strength, leg.foot);
      }
    }
  }

  // #endregion

  // #region Body

  const _groundNormal = vec3.create();
  const leanTarget = vec2.create();

  function updateBody(dt: number, runFactor: number, sprintFactor: number) {
    // Faster gaits lean further forward. This is part of the pose, not a loss of balance.
    const gaitLean = runFactor * 0.12 + sprintFactor * 0.16;
    // Pitch into accelerations, and with the slope of the ground.
    const forwardSpeed = velocity.value[0] * forward[0] + velocity.value[1] * forward[2];
    const acceleration = (forwardSpeed - previousForwardSpeed) / Math.max(dt, 1e-4);
    previousForwardSpeed = forwardSpeed;
    accelerationPitch = lerp(accelerationPitch, clamp(acceleration * 0.07, -0.2, 0.2), 0.1);
    terrain.normalAt(_groundNormal, position[0], position[2]);
    const slopePitch = -vec3.dot(_groundNormal, forward);
    const slopeRoll = vec3.dot(_groundNormal, sideways);

    // Lean into turns, like anything with momentum does.
    const yawRate = deltaYaw(previousHeading, heading.value) / Math.max(dt, 1e-4);
    previousHeading = heading.value;
    turnLean = lerp(turnLean, clamp(-yawRate * forwardSpeed * 0.05, -0.25, 0.25), 0.1);

    // Shift weight over the planted foot while the other one is in the air.
    const planted = legs.filter((leg) => leg.swing < 0);
    const swinging = legs.find((leg) => leg.swing >= 0);
    spring.update(weightShift, planted.length === 1 ? planted[0].side * 0.35 : 0, 0.3, 0.6, dt);
    vec2.set(
      leanTarget,
      accelerationPitch + gaitLean - slopePitch * 0.5,
      -weightShift.value * 0.08 + turnLean + slopeRoll * 0.4,
    );
    spring2.update(lean, leanTarget, 0.35, 0.4, dt);

    // Ride height follows the ground under the body and both feet, and dips on every stomp.
    const feet = legs.reduce((sum, leg) => sum + (leg.swing >= 0 ? leg.to[1] : leg.foot[1]), 0);
    const ground = 0.5 * terrain.heightAt(position[0], position[2]) + 0.25 * feet;
    // Vault over the planted leg, or bound upwards while both feet are off the ground.
    const vault =
      planted.length === 0
        ? 1.3 * sprintFactor
        : swinging
          ? 0.25 * Math.sin(Math.PI * swinging.swing)
          : 0;
    let targetHeight = ground + RIDE_HEIGHT - 0.4 * runFactor - 0.3 * sprintFactor + vault;
    // Never lift the hips higher than planted legs can reach.
    for (const leg of legs) {
      if (leg.swing >= 0) {
        continue;
      }
      const dx = position[0] + sideways[0] * HIP[0] * leg.side - leg.foot[0];
      const dz = position[2] + sideways[2] * HIP[0] * leg.side - leg.foot[2];
      const reach = ((THIGH + SHIN) * 0.95) ** 2 - dx * dx - dz * dz;
      targetHeight = Math.min(
        targetHeight,
        leg.foot[1] + ANKLE_LIFT + Math.sqrt(Math.max(0, reach)) - HIP[1],
      );
    }
    spring.update(height, targetHeight, lerp(0.28, 0.16, sprintFactor), 0.5, dt);
    position[1] = height.value;

    // The pelvis swings with the legs, and the chest counter-rotates.
    let stride = 0;
    for (const leg of legs) {
      const dx = leg.foot[0] - position[0];
      const dz = leg.foot[2] - position[2];
      stride += leg.side * (dx * forward[0] + dz * forward[2]);
    }
    // A positive yaw swings the +X side backwards, hence the minus: the hip on the side of the
    // forward foot should swing forward.
    spring.damp(twist, clamp(-stride * 0.08, -0.3, 0.3), 0.12, dt);

    quat.identity(pelvisRotation);
    quat.rotateY(pelvisRotation, pelvisRotation, heading.value + twist.value);
    quat.rotateX(pelvisRotation, pelvisRotation, lean.value[0] * 0.6);
    quat.rotateZ(pelvisRotation, pelvisRotation, lean.value[1] * 0.6);
    vec3.scaleAndAdd(pelvisPosition, position, sideways, weightShift.value);

    quat.identity(chestRotation);
    quat.rotateY(chestRotation, chestRotation, heading.value - twist.value * 0.8);
    quat.rotateX(chestRotation, chestRotation, lean.value[0]);
    quat.rotateZ(chestRotation, chestRotation, lean.value[1]);
    attachPoint(chestPosition, pelvisPosition, pelvisRotation, CHEST);

    // The head stays level and looks where it is going, as far as the neck allows.
    const headYaw = heading.value + clamp(deltaYaw(heading.value, gaze.value), -1.1, 1.1);
    quat.identity(headRotation);
    quat.rotateY(headRotation, headRotation, headYaw);
    quat.rotateX(headRotation, headRotation, lean.value[0] * 0.3 + 0.08);
    attachPoint(headPosition, chestPosition, chestRotation, NECK);

    // How off-balance the body is: knocked away from the pose it wants to hold (a stumble,
    // a hard landing, a sudden turn), or tilted further sideways than is comfortable.
    // Pitching forward and back is mostly just speeding up and slowing down, so it counts
    // for much less than being knocked sideways.
    const disturbance = Math.hypot(
      (lean.value[0] - leanTarget[0]) * 0.4,
      lean.value[1] - leanTarget[1],
    );
    const sideTilt = Math.abs(lean.value[1]);
    const offBalance = disturbance * 3 + Math.max(0, sideTilt - 0.2) * 3;
    spring.damp(balance, clamp((offBalance - 0.35) * 1.5, 0, 1), 0.2, dt);
  }

  // #endregion

  // #region Legs

  const _pole = vec3.create();
  const _footForward = vec3.create();
  const _footRotation = quat.create();

  function solveLeg(leg: Leg) {
    attachPoint(leg.hip, pelvisPosition, pelvisRotation, [HIP[0] * leg.side, HIP[1], HIP[2]]);
    vec3.scaleAndAdd(leg.ankle, leg.foot, leg.normal, ANKLE_LIFT);
    // Knees point forward, and a little outward.
    vec3.transformQuat(_pole, [leg.side * 0.2, 0, 1], pelvisRotation);
    solveLimb(leg.limb, leg.hip, leg.ankle, _pole);

    const [thigh, shin] = leg.limb.chain.bones;
    const axis = leg.limb.axis;
    const p = leg.parts;
    vec3.copy(p.hipJoint.position, leg.hip);
    span(p.thigh, thigh.start, thigh.end, axis, 0.5);
    span(p.shin, shin.start, shin.end, axis, 0.2);
    vec3.copy(p.knee.position, thigh.end);
    orient(p.knee.rotation, axis, vec3.sub(_v, shin.end, shin.start));
    // The knee cap sits in front of the knee, between the thigh and shin directions.
    fabrik3.getBoneDirection(_v, leg.limb.chain, 0);
    fabrik3.getBoneDirection(_w, leg.limb.chain, 1);
    vec3.normalize(_dir, vec3.sub(_dir, _v, _w));
    vec3.scaleAndAdd(p.kneeCap.position, thigh.end, _dir, 0.45);
    orient(p.kneeCap.rotation, vec3.add(_w, _w, _v), _dir);
    vec3.copy(p.ankleJoint.position, shin.end);

    // The foot follows the ground normal, and rolls heel-to-toe while stepping.
    vec3.set(_footForward, Math.sin(leg.yaw), 0, Math.cos(leg.yaw));
    orient(_footRotation, leg.normal, _footForward);
    if (leg.swing >= 0) {
      const t = leg.swing;
      quat.rotateX(_footRotation, _footRotation, 0.45 * Math.sin(Math.PI * 2 * t) * (1 - t * 0.5));
    }
    attach(p.foot, leg.foot, _footRotation, [0, 0.25, 0.25]);
    attach(p.toe, leg.foot, _footRotation, [0, 0.21, 1.6]);
  }

  // #endregion

  // #region Arms

  const _swing = vec3.create();
  const _outstretched = vec3.create();
  const _target = vec3.create();
  const _chestUp = vec3.create();

  function solveArm(arm: Arm, dt: number, runFactor: number, sprintFactor: number) {
    const { side } = arm;
    attachPoint(arm.shoulder, chestPosition, chestRotation, [
      SHOULDER[0] * side,
      SHOULDER[1],
      SHOULDER[2],
    ]);

    // Walking: swing forward together with the opposite leg. Running bends the elbows more.
    const opposite = legs[side === 1 ? 0 : 1];
    const reachForward =
      (opposite.foot[0] - opposite.hip[0]) * forward[0] +
      (opposite.foot[2] - opposite.hip[2]) * forward[2];
    const pump = lerp(0.45, 0.8, runFactor) + 0.35 * sprintFactor;
    const swing = clamp(reachForward * pump, -2.2, 2.6);
    attachPoint(_swing, arm.shoulder, chestRotation, [
      side * 0.45,
      -ARM_REACH * (lerp(0.9, 0.62, runFactor) - 0.08 * sprintFactor) + Math.abs(swing) * 0.2,
      swing + runFactor * 0.8 + sprintFactor * 0.4,
    ]);

    // Balancing: arms stretch out to the sides. The arm on the side that is lifting goes up
    // and the other one drops a little, shifting weight against the fall.
    vec3.transformQuat(_chestUp, UP, chestRotation);
    const leaning = vec3.dot(_chestUp, sideways) * side;
    vec3.scaleAndAdd(_outstretched, arm.shoulder, sideways, side * ARM_REACH * 0.7);
    vec3.scaleAndAdd(_outstretched, _outstretched, forward, 0.6);
    _outstretched[1] += clamp(-0.9 - leaning * 6, -2.2, 0.6);

    vec3.lerp(_target, _swing, _outstretched, easing.sineInOut(balance.value) * 0.8);
    spring3.update(arm.hand, _target, 0.14, 0.55, dt);

    // Elbows point back, and a little out.
    vec3.transformQuat(_pole, [side * 0.5, -0.3, -1], chestRotation);
    solveLimb(arm.limb, arm.shoulder, arm.hand.value, _pole);

    const [upper, fore] = arm.limb.chain.bones;
    const axis = arm.limb.axis;
    const p = arm.parts;
    vec3.copy(p.shoulderJoint.position, arm.shoulder);
    attach(p.pauldron, arm.shoulder, chestRotation, [side * 0.25, 0.45, 0]);
    span(p.upperArm, upper.start, upper.end, axis, 0.2);
    span(p.forearm, fore.start, fore.end, axis, -0.2);
    vec3.copy(p.elbow.position, upper.end);
    orient(p.elbow.rotation, axis, vec3.sub(_v, fore.end, fore.start));
    fabrik3.getBoneDirection(_dir, arm.limb.chain, 1);
    span(p.hand, fore.end, vec3.scaleAndAdd(_v, fore.end, _dir, 0.95), axis);
  }

  // #endregion

  // #region Upper body

  const _antennaBase = vec3.create();
  const _antennaRest = vec3.create();
  const _tip = vec3.create();

  function poseUpperBody(dt: number) {
    attach(body.pelvis, pelvisPosition, pelvisRotation, [0, 0, 0]);
    attach(body.waist, pelvisPosition, pelvisRotation, [0, 1.0, -0.05]);
    attach(body.chest, chestPosition, chestRotation, [0, 0, 0]);
    attach(body.chestPlate, chestPosition, chestRotation, [0, 0.35, 1.25]);
    attach(body.backpack, chestPosition, chestRotation, [0, 0.2, -1.75]);
    body.vents.forEach((vent, i) => {
      attach(vent, chestPosition, chestRotation, [(i - 0.5) * 1.3, 1.55, -2.1], VENT_TILT);
    });
    attach(body.neck, chestPosition, chestRotation, [0, 1.45, 0.1]);
    attach(body.head, headPosition, headRotation, [0, 0.35, 0]);
    attach(body.visor, headPosition, headRotation, [0, 0.4, 0.86]);

    // The antenna tip is an under-damped spring chasing its rest position, so it whips around.
    attachPoint(_antennaBase, headPosition, headRotation, [-0.45, 0.95, -0.4]);
    attachPoint(_antennaRest, headPosition, headRotation, [-0.6, 3.3, -0.9]);
    spring3.update(antennaTip, _antennaRest, 0.16, 0.22, dt);
    vec3.normalize(_dir, vec3.sub(_dir, antennaTip.value, _antennaBase));
    vec3.scaleAndAdd(_tip, _antennaBase, _dir, 2.4);
    span(body.mast, _antennaBase, _tip, sideways);
    vec3.copy(body.beacon.position, _tip);
  }

  // #endregion

  function setMarker(at: Vec3 | undefined) {
    if (!at) {
      vec3.zero(marker.pole.scale);
      vec3.zero(marker.flag.scale);
      return;
    }
    vec3.set(marker.pole.scale, 0.14, 3.4, 0.14);
    vec3.set(marker.flag.scale, 0.08, 0.9, 1.3);
    quat.identity(marker.pole.rotation);
    quat.setAxisAngle(marker.flag.rotation, UP, time * 0.8);
    vec3.set(marker.pole.position, at[0], at[1] + 1.7, at[2]);
    attach(marker.flag, marker.pole.position, marker.flag.rotation, [0, 1.1, 0.65]);
  }

  function setGoal(at: Vec3 | undefined, orb: Vec3, glow: number) {
    if (!at) {
      vec3.zero(goalParts.base.scale);
      vec3.zero(goalParts.stone.scale);
      vec3.zero(goalParts.orb.scale);
      return;
    }
    vec3.set(goalParts.base.scale, 3.4, 1.2, 3.4);
    vec3.set(goalParts.stone.scale, 1.2, 4.4, 1.2);
    vec3.setScalar(goalParts.orb.scale, 1.1 + glow * 0.3);
    quat.identity(goalParts.base.rotation);
    vec3.set(goalParts.base.position, at[0], at[1] + 0.2, at[2]);
    quat.copy(goalParts.stone.rotation, STONE_TILT);
    vec3.set(goalParts.stone.position, at[0], at[1] + 2.4, at[2]);
    quat.setAxisAngle(goalParts.orb.rotation, UP, time);
    vec3.set(goalParts.orb.position, orb[0], orb[1] + Math.sin(time * 2) * 0.25, orb[2]);
  }

  /** Swells the antenna's beacon while a pulse goes out. */
  function setBeaconGlow(glow: number) {
    vec3.setScalar(body.beacon.scale, 0.3 * (1 + glow * 1.5));
  }

  function update(dt: number, input: RigInput) {
    time += dt;
    const maxSpeed = input.run ? SPRINT_SPEED : WALK_SPEED;
    spring2.damp(velocity, [input.direction[0] * maxSpeed, input.direction[1] * maxSpeed], 0.6, dt);
    const speed = vec2.length(velocity.value);
    const runFactor = clamp((speed - STROLL_SPEED) / (WALK_SPEED - STROLL_SPEED), 0, 1);
    const sprintFactor = clamp((speed - WALK_SPEED) / (SPRINT_SPEED - WALK_SPEED), 0, 1);

    if (speed > 0.4) {
      const desiredHeading = Math.atan2(velocity.value[0], velocity.value[1]);
      const turnTime = lerp(0.45, 0.7, runFactor) + 0.3 * sprintFactor;
      spring.dampAngle(heading, desiredHeading, turnTime, dt);
    }
    // The head turns to where the walker is being steered right away. The body (and its
    // velocity) takes its time to follow.
    const steering = vec2.length(input.direction) > 0.1;
    const gazeTarget = steering
      ? Math.atan2(input.direction[0], input.direction[1])
      : heading.value;
    spring.dampAngle(gaze, gazeTarget, 0.15, dt);
    position[0] += velocity.value[0] * dt;
    position[2] += velocity.value[1] * dt;
    vec3.set(forward, Math.sin(heading.value), 0, Math.cos(heading.value));
    vec3.set(sideways, Math.cos(heading.value), 0, -Math.sin(heading.value));

    // Faster gaits take quicker steps, up to a walk. A sprint takes longer, bounding strides.
    const stepTime = lerp(lerp(0.62, 0.42, runFactor), 0.72, sprintFactor);
    updateGait(dt, speed, stepTime, runFactor, sprintFactor);
    updateBody(dt, runFactor, sprintFactor);
    for (const leg of legs) {
      solveLeg(leg);
    }
    for (const arm of arms) {
      solveArm(arm, dt, runFactor, sprintFactor);
    }
    poseUpperBody(dt);
    updateColliders();
  }

  // Spheres around the body, for anything that needs to steer clear of the walker.
  // Each one follows a point of the skeleton, and is stored as [x, y, z, radius].
  const colliderSources: [Vec3, number][] = [
    [headPosition, 1.6],
    [chestPosition, 2.8],
    [pelvisPosition, 2.0],
    ...arms.flatMap((arm): [Vec3, number][] => [
      [arm.shoulder, 1.4],
      [arm.limb.chain.bones[0].end, 1.0],
      [arm.limb.chain.bones[1].end, 1.0],
    ]),
    ...legs.map((leg): [Vec3, number] => [leg.limb.chain.bones[0].end, 1.1]),
  ];
  const colliders: Vec4[] = colliderSources.map(([, radius]) => [0, 0, 0, radius]);
  function updateColliders() {
    colliderSources.forEach(([center], i) => {
      colliders[i][0] = center[0];
      colliders[i][1] = center[1];
      colliders[i][2] = center[2];
    });
  }

  // Settle into a stance before the first frame.
  for (let i = 0; i < 30; i++) {
    update(1 / 30, { direction: [0, 0], run: false });
  }

  return {
    partsByShape: byShape,
    position,
    chestPosition,
    headPosition,
    colliders,
    get heading() {
      return heading.value;
    },
    get balance() {
      return balance.value;
    },
    antennaTip: body.beacon.position,
    update,
    setMarker,
    setGoal,
    setBeaconGlow,
  };
}

export type Rig = ReturnType<typeof createRig>;
