import { Distribution, ExecutionMode } from './types.ts';

export const initialCameraPosition = [0, 0, 0.4];
export const initialCameraAngle = 15;
export const initialNumSamples = 5000;
export const initialDistribution: Distribution = Distribution.SAMPLE;
export const distributions: Distribution[] = Object.values(Distribution);
export const initialExecutionMode: ExecutionMode = ExecutionMode.SINGLE;
export const executionModes: ExecutionMode[] = Object.values(ExecutionMode);
export const minNumSamples = 100;
export const maxNumSamples = 65100;
export const step = 100;
