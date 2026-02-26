import { BPETER, LCG, type StatefulGenerator } from '@typegpu/noise';

export const PRNG = {
  BPETER: 'bpeter (default)',
  LCG: 'lcg',
} as const;

export type PRNG = typeof PRNG[keyof typeof PRNG];

const PRNG_MAP = {
  [PRNG.BPETER]: BPETER,
  [PRNG.LCG]: LCG,
};

export const getPRNG = (prng: PRNG): StatefulGenerator => PRNG_MAP[prng];
