import { Distribution, Generator } from './types.ts';

export const popupCooldown = 100000;
export const cameraPositionGeo = [0, 0, 0.5];
export const cameraPositionHist = [0, 0, 0.2];
export const initialCameraAngle = 15;
export const numSamplesOptions = [100, 1000, 2000, 5000, 10000, 50000];
export const initialNumSamples = numSamplesOptions[2];
export const initialGenerator: Generator = Generator.BPETER;
export const generators: Generator[] = Object.values(Generator);
export const initialDistribution: Distribution = Distribution.NORMAL;
export const distributions: Distribution[] = Object.values(Distribution);
