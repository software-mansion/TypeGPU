import { isBuiltin } from '../../data/attributes.ts';
import { isData } from '../../data/dataTypes.ts';
import { isVoid } from '../../data/wgslTypes.ts';
import type { FragmentOutConstrained } from '../function/tgpuFragmentFn.ts';
import type { AnyFragmentTargets } from './renderPipeline.ts';

function isColorTargetState(
  value: unknown | GPUColorTargetState,
): value is GPUColorTargetState {
  return typeof (value as GPUColorTargetState)?.format === 'string';
}

export function connectTargetsToShader(
  shaderOutputLayout: FragmentOutConstrained | undefined,
  targets: AnyFragmentTargets,
): GPUColorTargetState[] {
  // For shell-less entry functions, we determine the layout based on solely the targets
  if (!shaderOutputLayout) {
    if (!targets) {
      return [];
    }

    if (typeof targets?.format === 'string') {
      return [targets as GPUColorTargetState];
    }

    return Object.values(targets) as GPUColorTargetState[];
  }

  if (isData(shaderOutputLayout)) {
    if (isVoid(shaderOutputLayout)) {
      return [];
    }

    if (!isColorTargetState(targets)) {
      throw new Error(
        'Expected a single color target configuration, not a record.',
      );
    }

    return [targets];
  }

  const result: GPUColorTargetState[] = [];
  for (const key of Object.keys(shaderOutputLayout)) {
    const outputValue = (shaderOutputLayout as Record<string, unknown>)[key];

    if (isBuiltin(outputValue)) {
      continue;
    }

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
