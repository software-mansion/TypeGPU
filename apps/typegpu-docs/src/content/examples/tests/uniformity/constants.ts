import { PRNG } from './prngs.ts';

export const gridSizes = [10, 25, 50, 100, 200, 500, 700, 1000];
export const initialGridSize = gridSizes[3];
export const initialPRNG = PRNG.DEFAULT_GENERATOR;
export const prngs: PRNG[] = Object.values(PRNG);
