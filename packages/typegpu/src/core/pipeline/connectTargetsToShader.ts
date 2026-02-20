import { isBuiltin } from '../../data/attributes.ts';
import { type BaseData, isVoid, isWgslStruct } from '../../data/wgslTypes.ts';
import type {
  AnyFragmentTargets,
  TgpuColorTargetState,
} from './renderPipeline.ts';

export function connectTargetsToShader(
  fragmentOut: BaseData,
  targets: AnyFragmentTargets,
): (GPUColorTargetState | null)[] {
  const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

  if (isVoid(fragmentOut) || isBuiltin(fragmentOut)) {
    return [null];
  }

  const result: GPUColorTargetState[] = [];
  if (isWgslStruct(fragmentOut)) {
    for (const key of Object.keys(fragmentOut.propTypes)) {
      const outputValue = fragmentOut.propTypes[key];

      if (isBuiltin(outputValue)) {
        continue;
      }

      const matchingTarget = (targets as Record<string, TgpuColorTargetState>)[
        key
      ];

      result.push({
        ...matchingTarget,
        format: matchingTarget?.format ?? presentationFormat,
      });
    }
  }

  const singleTarget = targets as TgpuColorTargetState;
  return [{
    ...singleTarget,
    format: singleTarget?.format ?? presentationFormat,
  }];
}
