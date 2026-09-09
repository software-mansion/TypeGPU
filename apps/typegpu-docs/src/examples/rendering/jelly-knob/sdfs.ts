import { d, std } from 'typegpu';
import * as sdf from '@typegpu/sdf';
import { GroundParams, JELLY_HALFSIZE } from './constants.ts';
import { rotateY } from './utils.ts';
import { BoundingBox, HitInfo, knobBehaviorSlot, ObjectType } from './dataTypes.ts';

// background sdfs

function sdJellyCutout(position: d.v2f) {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const groundRadius = GroundParams.jellyCutoutRadius;

  return sdf.sdDisk(position, groundRadius + groundRoundness);
}

function sdMeterCutout(position: d.v2f) {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const meterCutoutRadius = GroundParams.meterCutoutRadius;
  const meterCutoutGirth = GroundParams.meterCutoutGirth;
  const angle = Math.PI / 2;

  return (
    sdf.sdArc(position, d.vec2f(std.sin(angle), std.cos(angle)), meterCutoutRadius) -
    (meterCutoutGirth + groundRoundness)
  );
}

export function sdFloorCutout(position: d.v2f) {
  'use gpu';
  const jellyCutoutDistance = sdJellyCutout(position);
  const meterCutoutDistance = sdMeterCutout(position);
  return sdf.opUnion(jellyCutoutDistance, meterCutoutDistance);
}

function sdArrowHead(p: d.v3f) {
  'use gpu';
  return (
    sdf.sdRhombus(
      p,
      // shorter on one end, longer on the other
      std.select(0.15, 0.05, p.x > 0),
      0.04, // width of the arrow head
      0.001, // thickness
      std.smoothstep(-0.1, 0.1, p.x) * 0.02,
    ) - 0.007
  );
}

/** Shared inverse deformation keeps the dial attached to the jelly's top. */
export function jellyRestPosition(position: d.v3f, displacement: d.v3f) {
  'use gpu';
  // Inverse of p -> p + displacement * max(p.y / .5, 0).
  const restHeight = std.max(position.y, 0) / (0.5 + displacement.y);
  return std.sub(position, std.mul(displacement, restHeight));
}

function deformationStretch(displacement: d.v3f) {
  'use gpu';
  return 1 + std.length(displacement) / (0.5 + displacement.y);
}

export function dialShadow(position: d.v3f, progress: number) {
  'use gpu';
  const displacement = knobBehaviorSlot.$.stateUniform.$.topDisplacement;
  const gap = 0.5 + displacement.y - position.y;
  if (gap <= 0) return 1;
  // Reuse the dial silhouette so its overhead shadow rotates with the pointer.
  const local = rotateY(
    d.vec3f(position.x - displacement.x, 0, position.z - displacement.z),
    -progress * Math.PI,
  );
  const softness = 0.014 + gap * 0.2;
  const coverage = 1 - std.smoothstep(0, softness, sdArrowHead(local));
  return 1 - coverage * 0.35 * std.smoothstep(0, 0.025, gap);
}

export function sdBackground(position: d.v3f) {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const groundThickness = GroundParams.groundThickness;
  const groundRoundness = GroundParams.groundRoundness;

  let dist = std.min(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0.1), // the plane underneath the jelly
    sdf.opExtrudeY(position, -sdFloorCutout(position.xz), groundThickness - groundRoundness) -
      groundRoundness,
  );

  // Axis
  dist = std.min(
    dist,
    sdArrowHead(
      rotateY(
        jellyRestPosition(position, state.topDisplacement) - d.vec3f(0, 0.5, 0),
        -state.topProgress * Math.PI,
      ),
    ) / deformationStretch(state.topDisplacement),
  );

  return dist;
}

// meter sdfs

export function sdMeter(position: d.v3f) {
  'use gpu';
  return sdf.opExtrudeY(position, sdMeterCutout(position.xz), 0);
}

// jelly sdfs

/**
 * Returns a transformed position.
 */
function opCheapBend(p: d.v3f, k: number) {
  'use gpu';
  const c = std.cos(k * p.x);
  const s = std.sin(k * p.x);
  const m = d.mat2x2f(c, -s, s, c);
  return d.vec3f(m * p.xy, p.z);
}

/**
 * Returns a transformed position.
 */
function opTwist(p: d.v3f, k: number): d.v3f {
  'use gpu';
  const c = std.cos(k * p.y);
  const s = std.sin(k * p.y);
  const m = d.mat2x2f(c, -s, s, c);
  return d.vec3f(m * p.xz, p.y);
}

function sdJellySegment(position: d.v3f) {
  'use gpu';
  return sdf.sdRoundedBox3d(
    opCheapBend(opCheapBend(position, 0.8).zyx, 0.8).zyx,
    JELLY_HALFSIZE - 0.1 / 2,
    0.1,
  );
}

export function sdJelly(position: d.v3f) {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const origin = d.vec3f(0, 0.18, 0);
  const twist = state.bottomProgress - state.topProgress;
  const displacement = state.topDisplacement;
  const undeformed = jellyRestPosition(position, displacement);
  let localPos = rotateY(undeformed - origin, -(state.topProgress + twist * 0.5) * Math.PI);
  localPos = opTwist(localPos, twist * 3).xzy;
  const rotated1Pos = rotateY(localPos, Math.PI / 6);
  const rotated2Pos = rotateY(localPos, Math.PI / 3);

  const distance = sdf.opSmoothUnion(
    sdJellySegment(localPos),
    sdf.opSmoothUnion(sdJellySegment(rotated1Pos), sdJellySegment(rotated2Pos), 0.01),
    0.01,
  );
  // Bound the inverse warp's stretch so ray steps do not skip the bent surface.
  return distance / deformationStretch(displacement);
}

// sdf helpers

export function getJellyBounds() {
  'use gpu';
  return BoundingBox({
    min: d.vec3f(-1, -1, -1),
    max: d.vec3f(1, 1, 1),
  });
}

export function getSceneDist(position: d.v3f) {
  'use gpu';
  const jelly = sdJelly(position);
  const mainScene = sdBackground(position);

  const hitInfo = HitInfo();
  hitInfo.distance = 1e30;

  if (jelly < hitInfo.distance) {
    hitInfo.distance = jelly;
    hitInfo.objectType = ObjectType.JELLY;
  }
  if (mainScene < hitInfo.distance) {
    hitInfo.distance = mainScene;
    hitInfo.objectType = ObjectType.BACKGROUND;
  }

  return hitInfo;
}
