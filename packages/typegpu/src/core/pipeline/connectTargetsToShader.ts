import { isBuiltin } from '../../data/attributes.ts';
import { type BaseData, isVoid, isWgslStruct } from '../../data/wgslTypes.ts';
import type { AnyFragmentTargets, TgpuColorTargetState } from './renderPipeline.ts';
import { invariant } from '../../errors.ts';
import { getCustomLocation } from '../../data/dataTypes.ts';

export function connectTargetsToShader(
  fragmentOut: BaseData,
  targets: AnyFragmentTargets,
): (GPUColorTargetState | null)[] {
  let presentationFormat: GPUTextureFormat | undefined;

  if (isVoid(fragmentOut) || isBuiltin(fragmentOut)) {
    return [];
  }

  if (isWgslStruct(fragmentOut)) {
    const varyings = Object.entries(fragmentOut.propTypes).filter(([, value]) => !isBuiltin(value));

    const result: (GPUColorTargetState | null)[] = [];

    function resize(size: number) {
      while (size > result.length) {
        result.push(null);
      }
    }

    for (const [key, outputValue] of varyings) {
      const matchingTarget = (targets as Record<string, TgpuColorTargetState>)[key];
      const location = getCustomLocation(outputValue);
      invariant(location !== undefined, `'withLocations' failed or was not called.`);

      resize(location);
      result[location] = {
        ...matchingTarget,
        format:
          matchingTarget?.format ??
          (presentationFormat ??= navigator.gpu.getPreferredCanvasFormat()),
      };
    }
    return result;
  }

  const singleTarget = targets as TgpuColorTargetState;
  return [
    {
      ...singleTarget,
      format:
        singleTarget?.format ?? (presentationFormat ??= navigator.gpu.getPreferredCanvasFormat()),
    },
  ];
}
