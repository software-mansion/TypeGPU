import { Distribution, Generator } from './types.ts';

export const cameraPositionGeo = [0, 0, 0.5];
export const cameraPositionHist = [0, 0, 0.1];
export const initialCameraAngle = 15;
export const initialGenerator = Generator.BPETER;
export const cooldown = 10000;
export const generators: Generator[] = Object.values(Generator);
export const numSamplesOptions = [
  100,
  250,
  500,
  1000,
  2000,
  5000,
  10000,
  50000,
];
export const initialNumSamples = numSamplesOptions[3];
export const initialDistribution: Distribution = Distribution.NORMAL;
export const distributions: Distribution[] = Object.values(Distribution);
