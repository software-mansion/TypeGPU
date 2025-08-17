import { Distribution, ExecutionMode } from './types.ts';

export const initialCameraPosition = [0, 0, 0.5];
export const initialNumSamples = 10000;
export const initialDistribution: Distribution = Distribution.ON_UNIT_SPHERE;
export const distributions: Distribution[] = Object.values(Distribution);
export const initialExecutionMode: ExecutionMode = ExecutionMode.SINGLE;
export const executionModes: ExecutionMode[] = Object.values(ExecutionMode);
