import tgpu from 'typegpu';
import { bool, u32, vec2f } from 'typegpu/data';
import { dot } from 'typegpu/std';
import { cross2d } from '../../utils.ts';
import { isCCW, rank3 } from '../utils.ts';
import { JoinPath, LineSegmentVertex } from '../types.ts';

export const joinShell = tgpu.fn(
  [u32, u32, JoinPath, LineSegmentVertex, vec2f, vec2f, vec2f, vec2f, vec2f, vec2f, bool, bool],
  vec2f,
);

export const joinSituationIndex = tgpu.fn(
  [vec2f, vec2f, vec2f, vec2f],
  u32,
)((ul, ur, dl, dr) => {
  // ur is the reference vector
  // we find all 6 orderings of the remaining ul, dl, dr
  const crossUL = cross2d(ur, ul);
  const crossDL = cross2d(ur, dl);
  const crossDR = cross2d(ur, dr);
  const signUL = crossUL >= 0;
  const signDL = crossDL >= 0;
  const signDR = crossDR >= 0;
  const dotUL = dot(ur, ul);
  const dotDL = dot(ur, dl);
  const dotDR = dot(ur, dr);

  return rank3(
    isCCW(dotUL, signUL, dotDL, signDL),
    isCCW(dotDL, signDL, dotDR, signDR),
    isCCW(dotUL, signUL, dotDR, signDR),
  );
});
