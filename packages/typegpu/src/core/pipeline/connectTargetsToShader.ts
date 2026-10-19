import { isBuiltin } from '../../data/attributes.ts';
import { type BaseData, isVoid, isWgslStruct } from '../../data/wgslTypes.ts';
import type { AnyFragmentTargets, TgpuColorTargetState } from './renderPipeline.ts';
import { invariant } from '../../errors.ts';
import { getCustomLocation } from '../../data/dataTypes.ts';

export interface ConnectedTarget {
  // Needed for the attachment.
  key: string | undefined;
  // Needed for the descriptor.
  target: GPUColorTargetState;
}

export function connectTargetsToShader(
  fragmentOut: BaseData,
  targets: AnyFragmentTargets,
): (ConnectedTarget | null)[] {
  if (isVoid(fragmentOut) || isBuiltin(fragmentOut)) {
    return [];
  }

  const result: (ConnectedTarget | null)[] = [];
  function putInResult(index: number, key: string | undefined, target: GPUColorTargetState) {
    while (index > result.length) {
      result.push(null);
    }
    result[index] = { key, target };
  }

  if (isWgslStruct(fragmentOut)) {
    const varyings = Object.entries(fragmentOut.propTypes).filter(([, value]) => !isBuiltin(value));

    for (const [key, outputValue] of varyings) {
      const matchingTarget = (targets as Record<string, TgpuColorTargetState> | undefined)?.[key];
      const location = getCustomLocation(outputValue);
      invariant(location !== undefined, `'withLocations' failed or was not called.`);

      putInResult(location, key, {
        ...matchingTarget,
        format: matchingTarget?.format ?? navigator.gpu.getPreferredCanvasFormat(),
      });
    }
  } else {
    const singleTarget = targets as TgpuColorTargetState;
    putInResult(getCustomLocation(fragmentOut) ?? 0, undefined, {
      ...singleTarget,
      format: singleTarget?.format ?? navigator.gpu.getPreferredCanvasFormat(),
    });
  }

  return result;
}
