import { isData } from '../../data/dataTypes.ts';
import type { FragmentOutConstrained } from '../function/tgpuFragmentFn.ts';
import type { AnyFragmentTargets } from './renderPipeline.ts';

function isColorTargetState(
  value: unknown | GPUColorTargetState,
): value is GPUColorTargetState {
  return typeof (value as GPUColorTargetState)?.format === 'string';
}

export function connectTargetsToShader(
  shaderOutputLayout: FragmentOutConstrained,
  targets: AnyFragmentTargets,
): GPUColorTargetState[] {
  if (isData(shaderOutputLayout)) {
    if (!isColorTargetState(targets)) {
      throw new Error(
        'Expected a single color target configuration, not a record.',
      );
    }

    return [targets];
  }

  const result: GPUColorTargetState[] = [];
  for (const key of Object.keys(shaderOutputLayout)) {
    const matchingTarget = (targets as Record<string, GPUColorTargetState>)[
      key
    ];

    if (!matchingTarget) {
      throw new Error(
        `A color target by the name of '${key}' was not provided to the shader.`,
      );
    }

    result.push(matchingTarget);
  }

  return result;
}
