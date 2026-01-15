import { PRNG } from './prngs.ts';

export const gridSizes = [8, 16, 32, 64, 128, 256, 512, 1024];
export const initialGridSize = gridSizes[4];
export const initialPRNG = PRNG.BPETER;
export const prngs: PRNG[] = Object.values(PRNG);
