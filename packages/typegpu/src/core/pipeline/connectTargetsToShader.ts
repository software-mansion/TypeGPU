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

  const result: (GPUColorTargetState | null)[] = [];
  function putInResult(index: number, value: GPUColorTargetState | null) {
    while (index > result.length) {
      result.push(null);
    }
    result[index] = value;
  }

  if (isWgslStruct(fragmentOut)) {
    const varyings = Object.entries(fragmentOut.propTypes).filter(([, value]) => !isBuiltin(value));

    for (const [key, outputValue] of varyings) {
      const matchingTarget = (targets as Record<string, TgpuColorTargetState>)[key];
      const location = getCustomLocation(outputValue);
      invariant(location !== undefined, `'withLocations' failed or was not called.`);

      putInResult(location, {
        ...matchingTarget,
        format:
          matchingTarget?.format ??
          (presentationFormat ??= navigator.gpu.getPreferredCanvasFormat()),
      });
    }
  } else {
    const singleTarget = targets as TgpuColorTargetState;
    putInResult(getCustomLocation(fragmentOut) ?? 0, {
      ...singleTarget,
      format:
        singleTarget?.format ?? (presentationFormat ??= navigator.gpu.getPreferredCanvasFormat()),
    });
  }

  return result;
}
