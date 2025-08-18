import { Distribution, ExecutionMode } from './types.ts';

export const initialCameraPosition = [0, 0, 0.3];
export const initialCameraAngle = 30;
export const initialNumSamples = 10000;
export const initialDistribution: Distribution = Distribution.SAMPLE;
export const distributions: Distribution[] = Object.values(Distribution);
export const initialExecutionMode: ExecutionMode = ExecutionMode.SINGLE;
export const executionModes: ExecutionMode[] = Object.values(ExecutionMode);
export const minNumSamples = 100;
export const maxNumSamples = 30000;
export const step = 100;
