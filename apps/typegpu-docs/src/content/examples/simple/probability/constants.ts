import { Distribution, ExecutionMode } from './types.ts';

export const cameraPositionGeo = [0, 0, 0.5];
export const cameraPositionHist = [0, 0, 0.2];
export const initialCameraAngle = 15;
export const initialNumSamples = 2000;
export const numSamplesOptions = [100, 1000, 2000, 5000, 10000, 50000];
export const initialDistribution: Distribution = Distribution.NORMAL;
export const distributions: Distribution[] = Object.values(Distribution);
export const initialExecutionMode: ExecutionMode = ExecutionMode.SINGLE;
export const executionModes: ExecutionMode[] = Object.values(ExecutionMode);
export const minNumSamples = 100;
export const maxNumSamples = 65100;
export const step = 100;
