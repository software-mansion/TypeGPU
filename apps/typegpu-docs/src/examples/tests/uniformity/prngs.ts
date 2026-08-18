import { BPETER, LCG32, XOROSHIRO64STARSTAR, type StatefulGenerator } from '@typegpu/noise';

interface PRNGOptions {
  name: string;
  generator: StatefulGenerator;
}

export const prngs = {
  xoroshiro64: { name: 'xoroshiro64 (default)', generator: XOROSHIRO64STARSTAR },
  bpeter: { name: 'bpeter', generator: BPETER },
  lcg32: { name: 'lcg32', generator: LCG32 },
} as const satisfies Record<string, PRNGOptions>;

export type PRNGKey = keyof typeof prngs;

export const prngKeys = Object.keys(prngs) as PRNGKey[];
