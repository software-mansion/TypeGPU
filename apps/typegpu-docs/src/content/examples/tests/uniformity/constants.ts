import { PRNG } from './prngs.ts';

export const gridSize = 100;
export const initialPRNG = PRNG.DEFAULT_GENERATOR;
export const prngs: PRNG[] = Object.values(PRNG);
