import {
  BPETER,
  DefaultGenerator,
  LCG,
  type StatefulGenerator,
} from '@typegpu/noise';

export const PRNG = {
  BPETER: 'bpeter',
  DEFAULT_GENERATOR: 'default',
  LCG: 'lcg',
} as const;

export type PRNG = typeof PRNG[keyof typeof PRNG];

const PRNG_MAP = {
  [PRNG.BPETER]: BPETER,
  [PRNG.DEFAULT_GENERATOR]: DefaultGenerator,
  [PRNG.LCG]: LCG,
};

export const getPRNG = (prng: PRNG): StatefulGenerator => PRNG_MAP[prng];
