import { miterJoin } from './miter.ts';
import { roundJoin } from './round.ts';

export const lineJoins = {
  miter: miterJoin,
  round: roundJoin,
};
