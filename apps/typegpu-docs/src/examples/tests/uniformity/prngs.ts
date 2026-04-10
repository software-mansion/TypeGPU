import { BPETER, LCG32, LCG64, XOROSHIRO64STARSTAR, type StatefulGenerator } from '@typegpu/noise';

interface PRNGOptions {
  name: string;
  generator: StatefulGenerator;
}

export const prngs = {
  bpeter: { name: 'bpeter (default)', generator: BPETER },
  lcg32: { name: 'lcg32', generator: LCG32 },
  lcg64: { name: 'lcg64', generator: LCG64 },
  xoroshiro64: { name: 'xoroshiro64', generator: XOROSHIRO64STARSTAR },
} as const satisfies Record<string, PRNGOptions>;

export type PRNGKey = keyof typeof prngs;

export const prngKeys = Object.keys(prngs) as PRNGKey[];
export const initialPRNG: PRNGKey = 'bpeter';
