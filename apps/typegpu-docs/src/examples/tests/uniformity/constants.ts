import type { PRNGKey } from './prngs.ts';

export const gridSizes = [8, 16, 32, 64, 128, 256, 512, 1024];
export const initialGridSize = gridSizes[4];
export const samplesPerThread = [1, 8, 16, 64, 256, 1024, 131072, 262144];
export const initialSamplesPerThread = samplesPerThread[0];
export const initialTakeAverage = false;
