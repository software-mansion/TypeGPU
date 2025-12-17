import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';
import { GroundParams, JELLY_HALFSIZE } from './constants.ts';
import { rotateY } from './utils.ts';
import {
  BoundingBox,
  HitInfo,
  knobBehaviorSlot,
  ObjectType,
} from './dataTypes.ts';

// background sdfs

const sdJellyCutout = (position: d.v2f) => {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const groundRadius = GroundParams.jellyCutoutRadius;

  return sdf.sdDisk(
    position,
    groundRadius + groundRoundness,
  );
};

const sdMeterCutout = (position: d.v2f) => {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const meterCutoutRadius = GroundParams.meterCutoutRadius;
  const meterCutoutGirth = GroundParams.meterCutoutGirth;
  const angle = Math.PI / 2;

  return sdf.sdArc(
    position,
    d.vec2f(std.sin(angle), std.cos(angle)),
    meterCutoutRadius,
    meterCutoutGirth + groundRoundness,
  );
};

export const sdFloorCutout = (position: d.v2f) => {
  'use gpu';
  const jellyCutoutDistance = sdJellyCutout(position);
  const meterCutoutDistance = sdMeterCutout(position);
  return sdf.opUnion(jellyCutoutDistance, meterCutoutDistance);
};

const sdArrowHead = (p: d.v3f) => {
  'use gpu';
  return sdf.sdRhombus(
    p,
    // shorter on one end, longer on the other
    std.select(0.15, 0.05, p.x > 0),
    0.04, // width of the arrow head
    0.001, // thickness
    std.smoothstep(-0.1, 0.1, p.x) * 0.02,
  ) - 0.007;
};

export const sdBackground = (position: d.v3f) => {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const groundThickness = GroundParams.groundThickness;
  const groundRoundness = GroundParams.groundRoundness;

  let dist = std.min(
    sdf.sdPlane(position, d.vec3f(0, 1, 0), 0.1), // the plane underneath the jelly
    sdf.opExtrudeY(
      position,
      -sdFloorCutout(position.xz),
      groundThickness - groundRoundness,
    ) - groundRoundness,
  );

  // Axis
  dist = std.min(
    dist,
    sdArrowHead(
      rotateY(
        position.sub(d.vec3f(0, 0.5, 0)),
        -state.topProgress * Math.PI,
      ),
    ),
  );

  return dist;
};

// meter sdfs

export const sdMeter = (position: d.v3f) => {
  'use gpu';
  const groundRoundness = GroundParams.groundRoundness;
  const meterCutoutRadius = GroundParams.meterCutoutRadius;
  const meterCutoutGirth = GroundParams.meterCutoutGirth;
  const angle = Math.PI / 2 * knobBehaviorSlot.$.stateUniform.$.topProgress;

  const arc = sdf.sdArc(
    rotateY(position, Math.PI / 2 - angle).xz,
    d.vec2f(std.sin(angle), std.cos(angle)),
    meterCutoutRadius,
    meterCutoutGirth + groundRoundness,
  );

  return sdf.opExtrudeY(position, arc, 0);
};

// jelly sdfs

/**
 * Returns a transformed position.
 */
const opCheapBend = (p: d.v3f, k: number) => {
  'use gpu';
  const c = std.cos(k * p.x);
  const s = std.sin(k * p.x);
  const m = d.mat2x2f(c, -s, s, c);
  return d.vec3f(m.mul(p.xy), p.z);
};

/**
 * Returns a transformed position.
 */
const opTwist = (p: d.v3f, k: number): d.v3f => {
  'use gpu';
  const c = std.cos(k * p.y);
  const s = std.sin(k * p.y);
  const m = d.mat2x2f(c, -s, s, c);
  return d.vec3f(m.mul(p.xz), p.y);
};

const sdJellySegment = (position: d.v3f) => {
  'use gpu';
  return sdf.sdRoundedBox3d(
    opCheapBend(opCheapBend(position, 0.8).zyx, 0.8).zyx,
    JELLY_HALFSIZE.sub(0.1 / 2),
    0.1,
  );
};

export const sdJelly = (position: d.v3f) => {
  'use gpu';
  const state = knobBehaviorSlot.$.stateUniform.$;
  const origin = d.vec3f(0, 0.18, 0);
  const twist = state.bottomProgress - state.topProgress;
  let localPos = rotateY(
    position.sub(origin),
    -(state.topProgress + twist * 0.5) * Math.PI,
  );
  localPos = opTwist(localPos, twist * 3).xzy;
  const rotated1Pos = rotateY(localPos, Math.PI / 6);
  const rotated2Pos = rotateY(localPos, Math.PI / 3);

  return sdf.opSmoothUnion(
    sdJellySegment(localPos),
    sdf.opSmoothUnion(
      sdJellySegment(rotated1Pos),
      sdJellySegment(rotated2Pos),
      0.01,
    ),
    0.01,
  );
};

// fake shadow

export const sdShadow = (position: d.v3f) => {
  'use gpu';

  return sdf.sdSphere(position, 0.5);
};

// sdf helpers

export const getJellyBounds = () => {
  'use gpu';
  return BoundingBox({
    min: d.vec3f(-1, -1, -1),
    max: d.vec3f(1, 1, 1),
  });
};

export const getSceneDist = (position: d.v3f) => {
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
};
