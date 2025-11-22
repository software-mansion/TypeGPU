import type { Infer, v2f } from 'typegpu/data';
import { bool, struct, vec2f } from 'typegpu/data';
import { dot, normalize, select } from 'typegpu/std';
import { miterPointNoCheck } from '../utils.ts';
import { MITER_DOT_PRODUCT_LIMIT } from './constants.ts';
import type { ExternalNormals } from './externalNormals.ts';

type JoinResult = Infer<typeof JoinResult>;
const JoinResult = struct({
  dL: vec2f,
  dR: vec2f,
  shouldJoinL: bool,
  shouldJoinR: bool,
  isHairpin: bool,
});

export function solveJoin(
  AB: v2f,
  BC: v2f,
  eAB: ExternalNormals,
  eBC: ExternalNormals,
  joinLimit: number,
  isCap: boolean,
) {
  'use gpu';
  const underLimitL = dot(eAB.nL, BC) < joinLimit;
  const underLimitR = dot(eAB.nR, BC) < joinLimit;
  const isHairpin = (dot(AB, BC) < 0 && underLimitL === underLimitR) ||
    dot(normalize(AB), normalize(BC)) < -MITER_DOT_PRODUCT_LIMIT;
  const tooCloseToJoinL = dot(eAB.nL, eBC.nL) > MITER_DOT_PRODUCT_LIMIT;
  const tooCloseToJoinR = dot(eAB.nR, eBC.nR) > MITER_DOT_PRODUCT_LIMIT;
  const shouldJoinL = isHairpin || underLimitL && !tooCloseToJoinL;
  const shouldJoinR = isHairpin || underLimitR && !tooCloseToJoinR;

  const dLMiter = miterPointNoCheck(eAB.nL, eBC.nL);
  const dRMiter = miterPointNoCheck(eBC.nR, eAB.nR);
  const dL = select(eBC.nL, dLMiter, !isCap && !shouldJoinL);
  const dR = select(eBC.nR, dRMiter, !isCap && !shouldJoinR);

  return JoinResult({ dL, dR, shouldJoinL, shouldJoinR, isHairpin });
}
