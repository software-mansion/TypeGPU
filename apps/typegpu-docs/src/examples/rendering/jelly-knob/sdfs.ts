import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import * as sdf from '@typegpu/sdf';
import { GroundParams } from './constants.ts';
import { rotateY } from './utils.ts';
import { knobBehaviorSlot } from './dataTypes.ts';

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

export const getBackgroundDist = (position: d.v3f) => {
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

// jelly sdfs
