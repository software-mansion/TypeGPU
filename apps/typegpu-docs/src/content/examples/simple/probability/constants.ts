import type { Distributions } from './types.ts';

export const initialCameraPosition = [0, 0, 0.5];
export const initialNumSamples = 10000;
export const initialDistribution: Distributions = 'onUnitSphere';
export const distributions: Distributions[] = ['onUnitSphere', 'inUnitSphere'];
