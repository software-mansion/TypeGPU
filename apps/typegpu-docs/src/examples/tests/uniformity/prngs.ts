import { BPETER, LCG32, XOROSHIRO64STARSTAR, type StatefulGenerator } from '@typegpu/noise';

interface PRNGOptions {
  name: string;
  generator: StatefulGenerator;
}

export const prngs = {
  bpeter: { name: 'bpeter (default)', generator: BPETER },
  lcg32: { name: 'lcg32', generator: LCG32 },
  xoroshiro64: { name: 'xoroshiro64', generator: XOROSHIRO64STARSTAR },
} as const satisfies Record<string, PRNGOptions>;

export type PRNGKey = keyof typeof prngs;

export const prngKeys = Object.keys(prngs) as PRNGKey[];
export const initialPRNG: PRNGKey = prngKeys[0];
