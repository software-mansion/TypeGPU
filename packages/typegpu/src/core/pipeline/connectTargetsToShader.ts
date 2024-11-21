import type { Vec4f } from '../../data';
import { isBaseData } from '../../types';
import type { IOLayout } from '../function/fnTypes';
import type { AnyFragmentTargets } from './renderPipeline';

function isColorTargetState(
  value: unknown | GPUColorTargetState,
): value is GPUColorTargetState {
  return typeof (value as GPUColorTargetState)?.format === 'string';
}

export function connectTargetsToShader(
  shaderOutputLayout: IOLayout<Vec4f>,
  targets: AnyFragmentTargets,
): GPUColorTargetState[] {
  if (isBaseData(shaderOutputLayout)) {
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
