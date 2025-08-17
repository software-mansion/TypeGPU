import { Distribution } from './types.ts';
import { randf } from '@typegpu/noise';

const distributionPRNGs = {
  [Distribution.ON_UNIT_SPHERE]: randf.onUnitSphere,
  [Distribution.IN_UNIT_SPHERE]: randf.inUnitSphere,
} as const;

export function getPRNG(distribution: Distribution) {
  return distributionPRNGs[distribution];
}
